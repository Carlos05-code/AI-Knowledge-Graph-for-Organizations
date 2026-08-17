import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { EmbeddingService } from '../../infrastructure/ai/embedding.service';
import { SearchService } from '../search/search.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { OcrService } from '../../infrastructure/ocr/ocr.service';

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
    chunk: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
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
  const mockOcr = {
    isOcrCandidate: jest.fn(),
    extractText: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: Neo4jService, useValue: mockNeo4j },
        { provide: EmbeddingService, useValue: mockEmbedding },
        { provide: SearchService, useValue: mockSearch },
        { provide: EventBusService, useValue: mockEventBus },
        { provide: OcrService, useValue: mockOcr },
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
    mockOcr.isOcrCandidate.mockReturnValue(false);
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

  it('should OCR scanned content during processing', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const scanPath = path.join(os.tmpdir(), `ocr-test-${Date.now()}.png`);
    fs.writeFileSync(scanPath, 'fake-bytes');

    mockOcr.isOcrCandidate.mockImplementation(
      (mime: string | null) => mime === 'image/png',
    );
    mockOcr.extractText.mockResolvedValue({
      text: 'scanned invoice text',
      engine: 'tesseract',
      pages: 3,
      confidence: 88,
    });
    mockPrisma.document.findUnique.mockResolvedValue({
      id: '2',
      title: 'Scan',
      filePath: scanPath,
      mimeType: 'image/png',
      metadata: {},
      organizationId: 'org-1',
    });
    mockPrisma.document.update.mockResolvedValue({});
    mockPrisma.chunk.createMany.mockResolvedValue({ count: 0 });
    mockSearch.indexDocumentChunks.mockResolvedValue(undefined);
    mockNeo4j.createNode.mockResolvedValue(undefined);

    await service.processDocument('2');

    expect(mockOcr.extractText).toHaveBeenCalledWith(scanPath);
    const updateCall = mockPrisma.document.update.mock.calls.find(
      (c: any[]) => c[0] && c[0].data && c[0].data.metadata,
    );
    expect(updateCall[0].data.metadata.ocrExtracted).toBe(true);
    expect(updateCall[0].data.metadata.ocrEngine).toBe('tesseract');
    expect(updateCall[0].data.metadata.ocrPages).toBe(3);
    expect(updateCall[0].data.metadata.ocrConfidence).toBe(88);
    expect(updateCall[0].data.wordCount).toBeGreaterThan(0);
    fs.unlinkSync(scanPath);
  });
});
