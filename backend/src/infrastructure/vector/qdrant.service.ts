import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private client!: QdrantClient;
  private readonly defaultCollection = 'knowledge_chunks';
  private readonly embeddingDimension: number;

  constructor(private config: ConfigService) {
    this.embeddingDimension = config.get('EMBEDDING_DIMENSION', 1536);
  }

  async onModuleInit() {
    const host = this.config.get('QDRANT_HOST', 'localhost');
    const port = this.config.get('QDRANT_PORT', 6333);
    const apiKey = this.config.get('QDRANT_API_KEY', '');

    this.client = new QdrantClient({
      host,
      port,
      apiKey: apiKey || undefined,
      https: false,
    });

    try {
      await this.ensureCollection(this.defaultCollection);
      this.logger.log(`Connected to Qdrant at ${host}:${port}`);
    } catch (error) {
      this.logger.warn(
        `Qdrant unavailable at ${host}:${port} — vector search disabled. Start Qdrant and restart to enable.`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  async ensureCollection(name: string): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some((c) => c.name === name);

    if (!exists) {
      await this.client.createCollection(name, {
        vectors: {
          size: this.embeddingDimension,
          distance: 'Cosine',
        },
        optimizers_config: {
          indexing_threshold: 20000,
        },
      });
      this.logger.log(`Created collection: ${name}`);
    }
  }

  async upsertPoints(collection: string, points: VectorPoint[]): Promise<void> {
    await this.client.upsert(collection, {
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    });
  }

  async search(
    collection: string,
    vector: number[],
    options: {
      limit?: number;
      offset?: number;
      filter?: Record<string, unknown>;
      scoreThreshold?: number;
    } = {},
  ): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
    const result = await this.client.search(collection, {
      vector,
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
      score_threshold: options.scoreThreshold,
      filter: options.filter as any,
      with_payload: true,
    });

    return result.map((r) => ({
      id: String(r.id),
      score: r.score ?? 0,
      payload: r.payload as Record<string, unknown>,
    }));
  }

  async hybridSearch(
    collection: string,
    vector: number[],
    keywordFilter: Record<string, unknown>,
    options: { limit?: number; offset?: number } = {},
  ): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
    const vectorResults = await this.search(collection, vector, {
      limit: options.limit ?? 20,
      offset: options.offset ?? 0,
      filter: keywordFilter,
    });

    return vectorResults;
  }

  async deletePoints(collection: string, ids: string[]): Promise<void> {
    await this.client.delete(collection, {
      points: ids,
    });
  }

  async deleteCollection(collection: string): Promise<void> {
    await this.client.deleteCollection(collection);
  }

  async getPoint(collection: string, id: string): Promise<VectorPoint | null> {
    try {
      const result = await this.client.retrieve(collection, {
        ids: [id],
        with_payload: true,
        with_vector: true,
      });
      if (result.length === 0) return null;
      return {
        id: String(result[0].id),
        vector: result[0].vector as number[],
        payload: result[0].payload as Record<string, unknown>,
      };
    } catch {
      return null;
    }
  }

  async getCollectionInfo(collection: string) {
    try {
      return await this.client.getCollection(collection);
    } catch {
      return null;
    }
  }

  async count(collection: string): Promise<number> {
    try {
      const result = await this.client.count(collection, { exact: true });
      return result.count;
    } catch {
      return 0;
    }
  }
}
