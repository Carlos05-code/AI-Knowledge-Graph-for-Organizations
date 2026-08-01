import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { EmbeddingService } from '../../infrastructure/ai/embedding.service';
import { SearchService } from '../search/search.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const mockPrisma = {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    chunk: { createMany: jest.fn(), findMany: jest.fn() },
  };

  const mockNeo4j = { createNode: jest.fn(), deleteNode: jest.fn() };
  const mockEmbedding = {
    generateEmbeddings: jest.fn().mockResolvedValue([Array(1536).fill(0.1)]),
  };
  const mockSearch = {
    indexDocumentChunks: jest.fn(),
    deleteDocumentChunks: jest.fn(),
  };
  const mockEventBus = { publish: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: Neo4jService, useValue: mockNeo4j },
        { provide: EmbeddingService, useValue: mockEmbedding },
        { provide: SearchService, useValue: mockSearch },
        { provide: EventBusService, useValue: mockEventBus },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should create a document', async () => {
    const dto = {
      title: 'Test Doc',
      filePath: '/test/doc.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      checksum: 'abc123',
    };
    const expected = { id: '1', ...dto, status: 'PENDING' };
    mockPrisma.document.create.mockResolvedValue(expected);
    mockNeo4j.createNode.mockResolvedValue(undefined);

    const result = await service.create(dto, 'org-1', 'user-1');
    expect(result).toEqual(expected);
    expect(mockPrisma.document.create).toHaveBeenCalled();
    expect(mockNeo4j.createNode).toHaveBeenCalled();
    expect(mockEventBus.publish).toHaveBeenCalled();
  });

  it('should find documents by organization', async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      { id: '1', title: 'Doc 1' },
    ]);
    mockPrisma.document.count.mockResolvedValue(1);

    const result = await service.findAll('org-1', { page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('should process a document', async () => {
    mockPrisma.document.findUnique.mockResolvedValue({
      id: '1',
      title: 'Test',
      filePath: '/fake/path',
      organizationId: 'org-1',
    });
    mockPrisma.document.update.mockResolvedValue({});
    mockPrisma.chunk.createMany.mockResolvedValue({ count: 0 });
    mockSearch.indexDocumentChunks.mockResolvedValue(undefined);

    await service.processDocument('1');
    expect(mockPrisma.document.update).toHaveBeenCalled();
  });
});
