import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SecretsService } from '../../infrastructure/security/secrets.service';
import { UserRole } from '../../domain/entities/user.entity';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    organizationId: string;
    role: UserRole;
  };
}

@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly connectedClients = new Map<string, AuthenticatedSocket>();

  constructor(
    private chatService: ChatService,
    private config: ConfigService,
    private prisma: PrismaService,
    private secrets: SecretsService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      const payload = await this.verifyToken(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      client.user = {
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role as UserRole,
      };

      this.connectedClients.set(client.id, client);
      this.logger.log(`Client connected: ${client.id} (${user.email})`);
      client.emit('connected', { clientId: client.id });
    } catch (error) {
      this.logger.warn(
        `Connection rejected: ${error instanceof Error ? error.message : String(error)}`,
      );
      client.emit('error', { message: 'Invalid token' });
      client.disconnect();
    }
  }

  private async verifyToken(token: string): Promise<{
    sub: string;
    email: string;
    orgId: string;
  }> {
    const { verify } = require('jsonwebtoken');
    const candidates = await this.secrets.getActiveJwtSecrets();
    for (const candidate of candidates) {
      try {
        const payload = verify(token, candidate);
        return {
          sub: payload.sub as string,
          email: payload.email as string,
          orgId: payload.orgId as string,
        };
      } catch {
        // try the next active secret
      }
    }
    throw new Error('Invalid token signature');
  }

  private assertCanWrite(client: AuthenticatedSocket): void {
    if (!client.user) throw new WsException('Unauthenticated');
    if (client.user.role === UserRole.VIEWER) {
      throw new WsException('VIEWER role is read-only');
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { content: string; conversationId?: string },
  ) {
    this.assertCanWrite(client);
    if (!data.content?.trim())
      throw new WsException('Message content required');

    const { content, conversationId } = data;
    const userId = client.user!.id;

    try {
      const conversation = await this.chatService.getOrCreateConversation(
        userId,
        content,
        conversationId,
      );

      await this.chatService.saveUserMessage(conversation.id, content);
      client.emit('message:user', {
        conversationId: conversation.id,
        content,
        createdAt: new Date(),
      });

      const context = await this.chatService.retrieveContext(content);
      await this.streamResponse(client, conversation.id, content, context);
    } catch (error) {
      this.logger.error('Message handling failed', error);
      client.emit('error', {
        message: 'Failed to process message',
        conversationId,
      });
    }
  }

  private async streamResponse(
    client: AuthenticatedSocket,
    conversationId: string,
    query: string,
    context: any[],
  ) {
    const contextText = context
      .map(
        (c: any, i: number) =>
          `[Source #${i + 1}] ${c.title || 'Untitled'}\n${(c.content || '').slice(0, 1000)}`,
      )
      .join('\n---\n');

    const { OpenAI } = require('openai');
    const openai = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });

    const stream = await openai.chat.completions.create({
      model: this.config.get('OPENAI_MODEL', 'gpt-4o'),
      messages: [
        {
          role: 'system',
          content: `You are an AI knowledge assistant. Answer based on context. Cite sources. Use markdown.\n\nContext:\n${contextText || 'No specific context available.'}`,
        },
        { role: 'user', content: query },
      ],
      temperature: 0.3,
      max_tokens: 1024,
      stream: true,
    });

    let fullContent = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullContent += delta;
        client.emit('message:token', {
          conversationId,
          token: delta,
          done: false,
        });
      }
    }

    const sources = context.slice(0, 5).map((c: any) => ({
      title: c.title || 'Source',
      id: c.id || '',
      type: c.type || 'document',
    }));

    await this.chatService.saveAssistantMessage(
      conversationId,
      fullContent,
      sources,
    );

    client.emit('message:token', {
      conversationId,
      token: '',
      done: true,
      sources,
      content: fullContent,
    });
  }

  @SubscribeMessage('conversation:list')
  async handleListConversations(
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.user) throw new WsException('Unauthenticated');
    const conversations = await this.chatService.listConversations(
      client.user.id,
    );
    client.emit('conversation:list', conversations);
  }

  @SubscribeMessage('conversation:get')
  async handleGetConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const conversation = await this.chatService.getConversationHistory(
      data.conversationId,
    );
    client.emit('conversation:get', conversation);
  }

  @SubscribeMessage('conversation:delete')
  async handleDeleteConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    this.assertCanWrite(client);
    await this.chatService.deleteConversation(
      data.conversationId,
      client.user!.id,
    );
    client.emit('conversation:deleted', {
      conversationId: data.conversationId,
    });
  }
}
