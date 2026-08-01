import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { QdrantService } from '../../infrastructure/vector/qdrant.service';
import { EmbeddingService } from '../../infrastructure/ai/embedding.service';

interface SearchOptions {
  mode?: 'keyword' | 'semantic' | 'hybrid';
  type?: string;
  page?: number;
  limit?: number;
  filters?: Record<string, unknown>;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly collectionName = 'knowledge_chunks';

  constructor(
    private prisma: PrismaService,
    private neo4j: Neo4jService,
    private qdrant: QdrantService,
    private embedding: EmbeddingService,
  ) {}

  async onModuleInit() {
    try {
      await this.qdrant.ensureCollection(this.collectionName);
    } catch (error) {
      this.logger.warn(
        `Knowledge chunk collection unavailable — semantic search disabled`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  async hybridSearch(
    organizationId: string,
    query: string,
    options: SearchOptions = {},
  ) {
    const mode = options.mode || 'hybrid';
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const startTime = Date.now();

    const orgFilter = { organizationId };
    const results: any[] = [];

    if (mode === 'keyword' || mode === 'hybrid') {
      const keywordResults = await this.keywordSearch(query, organizationId);
      results.push(
        ...keywordResults.map((r) => ({ ...r, searchType: 'keyword' })),
      );
    }

    if (mode === 'semantic' || mode === 'hybrid') {
      const semanticResults = await this.semanticSearch(
        query,
        organizationId,
        orgFilter,
      );
      results.push(
        ...semanticResults.map((r) => ({ ...r, searchType: 'semantic' })),
      );
    }

    if (mode === 'hybrid') {
      const graphResults = await this.graphSearch(query);
      results.push(...graphResults.map((r) => ({ ...r, searchType: 'graph' })));
    }

    const ranked = this.rerank(results, query);
    const paginated = ranked.slice((page - 1) * limit, page * limit);

    const duration = Date.now() - startTime;

    return {
      data: paginated,
      meta: {
        total: ranked.length,
        page,
        limit,
        totalPages: Math.ceil(ranked.length / limit),
        hasNext: page * limit < ranked.length,
        hasPrevious: page > 1,
        duration,
      },
      mode,
      query,
    };
  }

  private async keywordSearch(query: string, organizationId: string) {
    const documents = await this.prisma.document.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: 'INDEXED',
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        fileType: true,
        source: true,
        createdAt: true,
      },
      take: 20,
    });

    const chunks = await this.prisma.chunk.findMany({
      where: {
        document: { organizationId, deletedAt: null },
        content: { contains: query, mode: 'insensitive' },
      },
      select: {
        id: true,
        content: true,
        documentId: true,
        document: { select: { title: true } },
      },
      take: 20,
    });

    return [
      ...documents.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        type: 'document',
        fileType: d.fileType,
        source: d.source,
        score: 0.6,
      })),
      ...chunks.map((c) => ({
        id: c.id,
        title: c.document.title,
        description: c.content.slice(0, 200),
        type: 'chunk',
        documentId: c.documentId,
        score: 0.5,
      })),
    ];
  }

  private async semanticSearch(
    query: string,
    _organizationId: string,
    _filter: Record<string, unknown>,
  ) {
    try {
      const vector = await this.embedding.generateEmbedding(query);
      const qdrantResults = await this.qdrant.search(
        this.collectionName,
        vector,
        {
          limit: 20,
          scoreThreshold: 0.3,
        },
      );

      return qdrantResults.map((r) => ({
        id: r.id,
        title: (r.payload.title as string) || 'Untitled',
        description: (r.payload.content as string)?.slice(0, 300) || '',
        type: (r.payload.type as string) || 'chunk',
        documentId: r.payload.documentId as string,
        score: r.score,
        vectorScore: r.score,
      }));
    } catch (error) {
      this.logger.warn('Semantic search unavailable', error);
      return [];
    }
  }

  private async graphSearch(query: string) {
    try {
      const nodes = await this.neo4j.searchNodes(query);
      return nodes.map((n: any) => ({
        id: n.id,
        title: n.name,
        type: 'entity',
        entityType: n.type || n.labels?.[0],
        description: `Knowledge graph entity of type ${n.type || 'unknown'}`,
        score: 0.7,
      }));
    } catch {
      return [];
    }
  }

  private rerank(results: any[], _query: string): any[] {
    const scored = results.map((r) => ({
      ...r,
      score: r.score || 0,
    }));
    return scored.sort((a, b) => b.score - a.score);
  }

  async getSearchSuggestions(query: string, organizationId: string) {
    const [documents, entities, chunks] = await Promise.all([
      this.prisma.document.findMany({
        where: {
          organizationId,
          deletedAt: null,
          title: { contains: query, mode: 'insensitive' },
        },
        select: { id: true, title: true },
        take: 5,
      }),
      this.neo4j.searchNodes(query, undefined, 5),
      this.prisma.chunk.findMany({
        where: {
          content: { contains: query, mode: 'insensitive' },
          document: { organizationId },
        },
        select: { id: true, content: true },
        take: 3,
      }),
    ]);

    return [
      ...documents.map((d) => ({
        id: d.id,
        text: d.title,
        type: 'document' as const,
      })),
      ...entities.map((e: any) => ({
        id: e.id,
        text: e.name,
        type: 'entity' as const,
      })),
      ...chunks.map((c) => ({
        id: c.id,
        text: c.content.slice(0, 100),
        type: 'chunk' as const,
      })),
    ];
  }

  async indexDocumentChunks(
    documentId: string,
    organizationId: string,
    chunks: Array<{ id: string; content: string; index: number }>,
  ) {
    try {
      const texts = chunks.map((c) => c.content);
      const vectors = await this.embedding.generateEmbeddings(texts);

      const points = chunks.map((chunk, i) => ({
        id: chunk.id,
        vector: vectors[i],
        payload: {
          documentId,
          organizationId,
          content: chunk.content.slice(0, 2000),
          index: chunk.index,
          type: 'chunk',
          indexedAt: new Date().toISOString(),
        },
      }));

      await this.qdrant.upsertPoints(this.collectionName, points);
      this.logger.log(
        `Indexed ${points.length} chunks for document ${documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to index document chunks: ${documentId}`,
        error,
      );
    }
  }

  async deleteDocumentChunks(documentId: string) {
    try {
      const collectionInfo = await this.qdrant.getCollectionInfo(
        this.collectionName,
      );
      if (!collectionInfo) return;

      const points = await this.qdrant.search(
        this.collectionName,
        Array(1536).fill(0),
        {
          limit: 100,
          filter: {
            must: [{ key: 'documentId', match: { value: documentId } }],
          },
        },
      );

      if (points.length > 0) {
        await this.qdrant.deletePoints(
          this.collectionName,
          points.map((p) => p.id),
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to delete chunks for document ${documentId}`,
        error,
      );
    }
  }
}
