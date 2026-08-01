import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { QdrantService } from '../../infrastructure/vector/qdrant.service';
import { EmbeddingService } from '../../infrastructure/ai/embedding.service';
import { ConfigService } from '@nestjs/config';

describe('ChatService', () => {
  let service: ChatService;

  const mockPrisma = {
    conversation: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    message: { create: jest.fn(), deleteMany: jest.fn() },
    document: { findMany: jest.fn() },
    chunk: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const mockNeo4j = {
    executeRaw: jest.fn().mockResolvedValue([]),
    searchNodes: jest.fn().mockResolvedValue([]),
  };

  const mockQdrant = {
    search: jest.fn().mockResolvedValue([]),
    ensureCollection: jest.fn(),
  };

  const mockEmbedding = {
    generateEmbedding: jest.fn().mockResolvedValue(Array(1536).fill(0.1)),
  };

  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const map: Record<string, any> = {
        OPENAI_API_KEY: 'sk-test-key',
        EMBEDDING_MODEL: 'text-embedding-3-small',
        OPENAI_MODEL: 'gpt-4o',
      };
      return map[key] ?? defaultValue;
    }),
  };

  const mockOpenAICompletions = {
    choices: [{ message: { content: 'Mock answer' }, finish_reason: 'stop' }],
    usage: { total_tokens: 10 },
  };

  beforeEach(async () => {
    Object.defineProperty(ChatService.prototype, 'openai', {
      get: () => ({
        chat: { completions: { create: jest.fn().mockResolvedValue(mockOpenAICompletions) } },
      }),
      configurable: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: Neo4jService, useValue: mockNeo4j },
        { provide: QdrantService, useValue: mockQdrant },
        { provide: EmbeddingService, useValue: mockEmbedding },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create conversation and send message', async () => {
    mockPrisma.conversation.create.mockResolvedValue({ id: 'conv-1', userId: 'user-1' });
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
    mockPrisma.document.findMany.mockResolvedValue([]);

    const result = await service.sendMessage('user-1', 'Test question');
    expect(result).toBeDefined();
    expect(result.conversationId).toBeDefined();
  });

  it('should list conversations', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([{ id: 'conv-1', messages: [] }]);
    const result = await service.listConversations('user-1');
    expect(result).toHaveLength(1);
  });

  it('should save user message', async () => {
    mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });
    const result = await service.saveUserMessage('conv-1', 'test');
    expect(result).toBeDefined();
  });
});
