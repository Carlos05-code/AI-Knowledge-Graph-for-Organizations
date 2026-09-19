import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { QdrantService } from '../../infrastructure/vector/qdrant.service';
import { EmbeddingService } from '../../infrastructure/ai/embedding.service';
import { OpenSearchService } from '../../infrastructure/search/opensearch.service';

describe('SearchService', () => {
  let service: SearchService;

  const prisma = {
    document: { findMany: jest.fn(), findUnique: jest.fn() },
    chunk: { findMany: jest.fn() },
  };
  const neo4j = { searchNodes: jest.fn().mockResolvedValue([]) };
  const qdrant = {
    ensureCollection: jest.fn(),
    search: jest.fn().mockResolvedValue([]),
    upsertPoints: jest.fn(),
    getCollectionInfo: jest.fn(),
    deletePoints: jest.fn(),
  };
  const embedding = {
    generateEmbedding: jest.fn(),
    generateEmbeddings: jest.fn(),
  };
  const opensearch = {
    isAvailable: jest.fn(),
    search: jest.fn(),
    indexChunks: jest.fn(),
    deleteByDocumentId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: Neo4jService, useValue: neo4j },
        { provide: QdrantService, useValue: qdrant },
        { provide: EmbeddingService, useValue: embedding },
        { provide: OpenSearchService, useValue: opensearch },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  describe('semantic search tenancy', () => {
    it('scopes the Qdrant search to the caller organization', async () => {
      embedding.generateEmbedding.mockResolvedValue(Array(1536).fill(0.1));
      qdrant.search.mockResolvedValue([]);

      await service.hybridSearch('org-1', 'onboarding', { mode: 'semantic' });

      expect(qdrant.search).toHaveBeenCalledWith(
        'knowledge_chunks',
        expect.any(Array),
        expect.objectContaining({
          filter: {
            must: [{ key: 'organizationId', match: { value: 'org-1' } }],
          },
        }),
      );
    });
  });

  describe('keyword search routing', () => {
    it('uses OpenSearch BM25 results when available', async () => {
      opensearch.isAvailable.mockReturnValue(true);
      opensearch.search.mockResolvedValue([
        {
          id: 'c1',
          score: 4.2,
          source: {
            title: 'Handbook',
            content: 'onboarding steps',
            documentId: 'd1',
          },
        },
      ]);

      const result = await service.hybridSearch('org-1', 'onboarding', {
        mode: 'keyword',
      });

      expect(opensearch.search).toHaveBeenCalledWith(
        'onboarding',
        'org-1',
        expect.objectContaining({ limit: 20 }),
      );
      expect(prisma.document.findMany).not.toHaveBeenCalled();
      expect(result.data).toEqual([
        expect.objectContaining({
          id: 'c1',
          title: 'Handbook',
          documentId: 'd1',
          score: 4.2,
          searchType: 'keyword',
        }),
      ]);
    });

    it('falls back to Postgres ILIKE when OpenSearch is unavailable', async () => {
      opensearch.isAvailable.mockReturnValue(false);
      prisma.document.findMany.mockResolvedValue([]);
      prisma.chunk.findMany.mockResolvedValue([
        {
          id: 'c2',
          content: 'onboarding steps for new hires',
          documentId: 'd1',
          document: { title: 'Handbook' },
        },
      ]);

      const result = await service.hybridSearch('org-1', 'onboarding', {
        mode: 'keyword',
      });

      expect(opensearch.search).not.toHaveBeenCalled();
      expect(prisma.chunk.findMany).toHaveBeenCalled();
      expect(result.data).toEqual([
        expect.objectContaining({ id: 'c2', title: 'Handbook', type: 'chunk' }),
      ]);
    });

    it('falls back to Postgres when OpenSearch errors mid-query', async () => {
      opensearch.isAvailable.mockReturnValue(true);
      opensearch.search.mockRejectedValue(new Error('cluster unreachable'));
      prisma.document.findMany.mockResolvedValue([]);
      prisma.chunk.findMany.mockResolvedValue([]);

      const result = await service.hybridSearch('org-1', 'onboarding', {
        mode: 'keyword',
      });

      expect(prisma.chunk.findMany).toHaveBeenCalled();
      expect(result.data).toEqual([]);
    });
  });

  describe('indexDocumentChunks', () => {
    it('indexes into both Qdrant and OpenSearch when OpenSearch is available', async () => {
      opensearch.isAvailable.mockReturnValue(true);
      embedding.generateEmbeddings.mockResolvedValue([[0.1, 0.2]]);
      prisma.document.findUnique.mockResolvedValue({ title: 'Handbook' });

      await service.indexDocumentChunks('d1', 'org-1', [
        { id: 'c1', content: 'hello world', index: 0 },
      ]);

      expect(qdrant.upsertPoints).toHaveBeenCalledTimes(1);
      expect(opensearch.indexChunks).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'c1',
          documentId: 'd1',
          organizationId: 'org-1',
          title: 'Handbook',
          content: 'hello world',
        }),
      ]);
    });

    it('skips OpenSearch indexing when unavailable, without throwing', async () => {
      opensearch.isAvailable.mockReturnValue(false);
      embedding.generateEmbeddings.mockResolvedValue([[0.1, 0.2]]);

      await service.indexDocumentChunks('d1', 'org-1', [
        { id: 'c1', content: 'hello world', index: 0 },
      ]);

      expect(opensearch.indexChunks).not.toHaveBeenCalled();
    });
  });

  describe('deleteDocumentChunks', () => {
    it('deletes from OpenSearch when available', async () => {
      opensearch.isAvailable.mockReturnValue(true);
      qdrant.getCollectionInfo.mockResolvedValue(null);

      await service.deleteDocumentChunks('d1');

      expect(opensearch.deleteByDocumentId).toHaveBeenCalledWith('d1');
    });

    it('does not call OpenSearch delete when unavailable', async () => {
      opensearch.isAvailable.mockReturnValue(false);
      qdrant.getCollectionInfo.mockResolvedValue(null);

      await service.deleteDocumentChunks('d1');

      expect(opensearch.deleteByDocumentId).not.toHaveBeenCalled();
    });
  });
});
