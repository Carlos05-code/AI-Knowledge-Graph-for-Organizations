import { ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { SecretsService } from '../../infrastructure/security/secrets.service';

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let chatServiceMock: {
    getOrCreateConversation: jest.Mock;
    saveUserMessage: jest.Mock;
    retrieveContext: jest.Mock;
    saveAssistantMessage: jest.Mock;
    listConversations: jest.Mock;
    getConversationHistory: jest.Mock;
    deleteConversation: jest.Mock;
  };
  let verifyMock: jest.Mock;
  const mockSecrets = { getActiveJwtSecrets: jest.fn() };
  const mockPrisma = { user: { findUnique: jest.fn() } };
  const configMock = { get: jest.fn(() => 'secret') };

  const makeSocket = (token?: string) => ({
    id: 'sock-1',
    handshake: { auth: token ? { token } : {}, query: {} },
    emit: jest.fn(),
    disconnect: jest.fn(),
  });

  type FakeSocket = ReturnType<typeof makeSocket>;
  type GatewaySocket = Parameters<typeof gateway.handleConnection>[0];

  const asSocket = (socket: FakeSocket) =>
    socket as unknown as GatewaySocket;

  beforeEach(async () => {
    jest.clearAllMocks();
    chatServiceMock = {
      getOrCreateConversation: jest.fn().mockResolvedValue({ id: 'c1' }),
      saveUserMessage: jest.fn().mockResolvedValue(undefined),
      retrieveContext: jest.fn().mockResolvedValue([]),
      saveAssistantMessage: jest.fn().mockResolvedValue(undefined),
      listConversations: jest.fn().mockResolvedValue([]),
      getConversationHistory: jest.fn().mockResolvedValue([]),
      deleteConversation: jest.fn().mockResolvedValue(undefined),
    };
    verifyMock = require('jsonwebtoken').verify as jest.Mock;
    verifyMock.mockReturnValue({
      sub: 'user-1',
      email: 'user@test.com',
      orgId: 'org-1',
    });
    mockSecrets.getActiveJwtSecrets.mockResolvedValue(['secret-a', 'secret-b']);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      role: 'USER',
      isActive: true,
      organizationId: 'org-1',
    });

    gateway = new ChatGateway(
      chatServiceMock as unknown as ChatService,
      configMock as unknown as ConfigService,
      mockPrisma as unknown as PrismaService,
      mockSecrets as unknown as SecretsService,
    );
  });

  it('should reject connections without a token', async () => {
    const socket = makeSocket();
    await gateway.handleConnection(asSocket(socket));
    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: 'Authentication required',
    });
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('should reject connections when no active secret signs the token', async () => {
    verifyMock.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const socket = makeSocket('tok');
    await gateway.handleConnection(asSocket(socket));
    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: 'Invalid token',
    });
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('should reject inactive users', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      role: 'USER',
      isActive: false,
      organizationId: 'org-1',
    });
    const socket = makeSocket('tok');
    await gateway.handleConnection(asSocket(socket));
    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: 'Invalid token',
    });
  });

  it('should accept valid connections and attach DB role', async () => {
    const socket = makeSocket('tok');
    await gateway.handleConnection(asSocket(socket));
    expect(socket.emit).toHaveBeenCalledWith('connected', {
      clientId: 'sock-1',
    });
    expect(mockSecrets.getActiveJwtSecrets).toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });

  it('should block VIEWER from sending messages', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'viewer-1',
      email: 'viewer@test.com',
      role: 'VIEWER',
      isActive: true,
      organizationId: 'org-1',
    });
    const socket = makeSocket('tok');
    await gateway.handleConnection(asSocket(socket));

    await expect(
      gateway.handleMessage(asSocket(socket), { content: 'hello' }),
    ).rejects.toThrow('VIEWER role is read-only');
    expect(chatServiceMock.getOrCreateConversation).not.toHaveBeenCalled();
  });

  it('should block VIEWER from deleting conversations', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'viewer-1',
      email: 'viewer@test.com',
      role: 'VIEWER',
      isActive: true,
      organizationId: 'org-1',
    });
    const socket = makeSocket('tok');
    await gateway.handleConnection(asSocket(socket));

    await expect(
      gateway.handleDeleteConversation(asSocket(socket), {
        conversationId: 'c1',
      }),
    ).rejects.toThrow('VIEWER role is read-only');
    expect(chatServiceMock.deleteConversation).not.toHaveBeenCalled();
  });

  it('should allow VIEWER to list conversations (read)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'viewer-1',
      email: 'viewer@test.com',
      role: 'VIEWER',
      isActive: true,
      organizationId: 'org-1',
    });
    const socket = makeSocket('tok');
    await gateway.handleConnection(asSocket(socket));

    await gateway.handleListConversations(asSocket(socket));
    expect(chatServiceMock.listConversations).toHaveBeenCalledWith('viewer-1');
    expect(socket.emit).toHaveBeenCalledWith('conversation:list', []);
  });

  it('should allow USER to send messages', async () => {
    const socket = makeSocket('tok');
    await gateway.handleConnection(asSocket(socket));

    await expect(
      gateway.handleMessage(asSocket(socket), { content: '   ' }),
    ).rejects.toThrow('Message content required');
  });
});