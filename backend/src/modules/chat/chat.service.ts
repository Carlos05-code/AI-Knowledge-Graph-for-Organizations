import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { QdrantService } from '../../infrastructure/vector/qdrant.service';
import { EmbeddingService } from '../../infrastructure/ai/embedding.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private _openai: any = null;

  private get openai(): any {
    if (!this._openai) {
      const OpenAI = require('openai').OpenAI;
      this._openai = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });
    }
    return this._openai;
  }

  constructor(
    private prisma: PrismaService,
    private neo4j: Neo4jService,
    private qdrant: QdrantService,
    private embedding: EmbeddingService,
    private config: ConfigService,
  ) {}

  async sendMessage(userId: string, content: string, conversationId?: string) {
    const conversation = await this.getOrCreateConversation(userId, content, conversationId);

    await this.prisma.message.create({
      data: { conversationId: conversation.id, role: 'USER', content },
    });

    const context = await this.retrieveContext(content);
    const answer = await this.generateAnswer(content, context);

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: answer.text,
        sources: answer.sources,
        confidence: answer.confidence,
        tokensUsed: answer.tokensUsed,
      },
    });

    return { message, conversationId: conversation.id };
  }

  async getOrCreateConversation(userId: string, content: string, conversationId?: string) {
    if (conversationId) {
      const existing = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
      if (existing) return existing;
    }
    return this.prisma.conversation.create({
      data: { userId, title: content.slice(0, 100) },
    });
  }

  async saveUserMessage(conversationId: string, content: string) {
    return this.prisma.message.create({
      data: { conversationId, role: 'USER', content },
    });
  }

  async saveAssistantMessage(conversationId: string, content: string, sources: any[]) {
    return this.prisma.message.create({
      data: { conversationId, role: 'ASSISTANT', content, sources },
    });
  }

  async retrieveContext(query: string) {
    const [vectorResults, graphResults, keywordResults] = await Promise.all([
      this.vectorSearch(query),
      this.graphSearch(query),
      this.keywordSearch(query),
    ]);

    const combined = [...vectorResults, ...graphResults, ...keywordResults];
    return this.rerankResults(combined);
  }

  private async vectorSearch(query: string) {
    try {
      const vector = await this.embedding.generateEmbedding(query);
      const results = await this.qdrant.search('knowledge_chunks', vector, {
        limit: 10,
        scoreThreshold: 0.3,
      });

      return results.map((r) => ({
        id: r.id,
        title: (r.payload.title as string) || 'Document Chunk',
        content: r.payload.content as string,
        documentId: r.payload.documentId as string,
        type: 'vector',
        score: r.score,
      }));
    } catch (error) {
      this.logger.warn('Vector search unavailable', error);
      return [];
    }
  }

  private async graphSearch(query: string) {
    try {
      const results = await this.neo4j.executeRaw(
        `MATCH (n)
         WHERE toLower(n.name) CONTAINS toLower($query)
         OPTIONAL MATCH (n)-[r]-(connected)
         RETURN n as entity,
                collect(DISTINCT {type: type(r), name: connected.name, id: connected.id}) as relations
         LIMIT 8`,
        { query },
      );
      return results.map((r: any) => ({
        id: r.entity.properties.id,
        title: r.entity.properties.name,
        content: `Knowledge graph entity of type ${r.entity.labels?.[0] || 'unknown'}`,
        relations: r.relations,
        type: 'graph',
        score: 0.7,
      }));
    } catch {
      return [];
    }
  }

  private async keywordSearch(query: string) {
    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: 'INDEXED',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, title: true, description: true, source: true },
      take: 5,
    });

    const chunks = await this.prisma.chunk.findMany({
      where: { content: { contains: query, mode: 'insensitive' } },
      select: { id: true, content: true, documentId: true },
      take: 5,
    });

    return [
      ...documents.map((d) => ({
        id: d.id,
        title: d.title,
        content: d.description || '',
        type: 'keyword',
        score: 0.5,
      })),
      ...chunks.map((c) => ({
        id: c.id,
        title: 'Content Match',
        content: c.content.slice(0, 500),
        type: 'keyword',
        score: 0.4,
      })),
    ];
  }

  private rerankResults(results: any[]): any[] {
    return results.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 15);
  }

  private async generateAnswer(query: string, context: any[]) {
    const contextText = this.formatContext(context);

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.config.get('OPENAI_MODEL', 'gpt-4o'),
        messages: [
          {
            role: 'system',
            content: `You are an AI knowledge assistant. Answer based on the provided context.

Guidelines:
- Cite specific sources for every claim
- If context lacks information, say so clearly
- Use markdown formatting for readability
- Include document titles and knowledge graph entities as citations

Context:\n${contextText}`,
          },
          { role: 'user', content: query },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      });

      const choice = completion.choices[0];
      const finishReason = choice?.finish_reason;

      return {
        text: choice?.message?.content || 'Unable to generate answer',
        sources: this.extractCitations(context),
        confidence: finishReason === 'stop' ? 0.9 : finishReason === 'length' ? 0.6 : 0.4,
        tokensUsed: completion.usage?.total_tokens || 0,
      };
    } catch (error) {
      this.logger.error('LLM call failed', error);
      return {
        text: this.fallbackResponse(context),
        sources: this.extractCitations(context),
        confidence: 0.3,
        tokensUsed: 0,
      };
    }
  }

  private formatContext(context: any[]): string {
    return context
      .map((c, i) => {
        const sourceType = c.type === 'graph' ? 'Knowledge Graph' : 'Document';
        const content = c.content || '';
        return `[${sourceType} #${i + 1}] ${c.title || 'Untitled'}\n${content.slice(0, 1000)}\n`;
      })
      .join('\n---\n');
  }

  private extractCitations(context: any[]): Array<{ title: string; id: string; type: string }> {
    return context.slice(0, 5).map((c) => ({
      title: c.title || 'Source',
      id: c.id || '',
      type: c.type || 'document',
    }));
  }

  private fallbackResponse(context: any[]): string {
    if (context.length === 0) {
      return 'I could not find relevant information to answer your question. Try rephrasing or searching for specific terms.';
    }
    const sources = context
      .slice(0, 3)
      .map((c) => `- **${c.title}** (${c.type || 'source'})`)
      .join('\n');
    return `I found some potentially relevant sources but encountered an error processing them:\n\n${sources}\n\nPlease try asking in a different way.`;
  }

  async getConversationHistory(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async listConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { content: true, role: true },
        },
      },
    });
  }

  async deleteConversation(conversationId: string, userId: string) {
    await this.prisma.message.deleteMany({ where: { conversationId } });
    await this.prisma.conversation.delete({ where: { id: conversationId } });
  }
}
