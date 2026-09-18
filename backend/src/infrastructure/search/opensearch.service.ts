import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@opensearch-project/opensearch';

export interface SearchableChunk {
  id: string;
  documentId: string;
  organizationId: string;
  title: string;
  content: string;
  index: number;
}

export interface KeywordHit {
  id: string;
  score: number;
  source: Record<string, unknown>;
}

@Injectable()
export class OpenSearchService implements OnModuleInit {
  private readonly logger = new Logger(OpenSearchService.name);
  private client!: Client;
  private available = false;
  private readonly defaultIndex: string;

  constructor(private config: ConfigService) {
    this.defaultIndex = config.get('OPENSEARCH_INDEX', 'knowledge_chunks');
  }

  async onModuleInit() {
    const node = this.config.get('OPENSEARCH_HOST', 'https://localhost:9200');
    const username = this.config.get('OPENSEARCH_USER', 'admin');
    const password = this.config.get('OPENSEARCH_PASSWORD', 'admin');

    this.client = new Client({
      node,
      auth: username ? { username, password } : undefined,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await this.ensureIndex(this.defaultIndex);
      this.available = true;
      this.logger.log(`Connected to OpenSearch at ${node}`);
    } catch (error) {
      this.available = false;
      this.logger.warn(
        `OpenSearch unavailable at ${node} — keyword search will fall back to database LIKE search. Start OpenSearch and restart to enable BM25 ranking.`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  async ensureIndex(name: string): Promise<void> {
    const exists = await this.client.indices.exists({ index: name });
    if (!exists.body) {
      await this.client.indices.create({
        index: name,
        body: {
          settings: {
            index: {
              number_of_shards: 1,
              number_of_replicas: 0,
            },
          },
          mappings: {
            properties: {
              documentId: { type: 'keyword' },
              organizationId: { type: 'keyword' },
              title: { type: 'text' },
              content: { type: 'text' },
              index: { type: 'integer' },
              indexedAt: { type: 'date' },
            },
          },
        },
      });
      this.logger.log(`Created OpenSearch index: ${name}`);
    }
  }

  async indexChunks(
    chunks: SearchableChunk[],
    index: string = this.defaultIndex,
  ): Promise<void> {
    if (chunks.length === 0) return;
    if (!this.available) throw new Error('OpenSearch is not available');

    const body = chunks.flatMap((chunk) => [
      { index: { _index: index, _id: chunk.id } },
      {
        documentId: chunk.documentId,
        organizationId: chunk.organizationId,
        title: chunk.title,
        content: chunk.content,
        index: chunk.index,
        indexedAt: new Date().toISOString(),
      },
    ]);

    const response = await this.client.bulk({ body, refresh: true });
    if (response.body.errors) {
      const firstError = response.body.items.find(
        (item: any) => item.index?.error,
      );
      this.logger.warn(
        `OpenSearch bulk index had errors: ${JSON.stringify(firstError)}`,
      );
    }
  }

  async deleteByDocumentId(
    documentId: string,
    index: string = this.defaultIndex,
  ): Promise<void> {
    if (!this.available) throw new Error('OpenSearch is not available');

    await this.client.deleteByQuery({
      index,
      refresh: true,
      body: {
        query: { term: { documentId } },
      },
    });
  }

  async search(
    query: string,
    organizationId: string,
    options: { limit?: number; index?: string } = {},
  ): Promise<KeywordHit[]> {
    if (!this.available) throw new Error('OpenSearch is not available');
    const index = options.index ?? this.defaultIndex;

    const response = await this.client.search({
      index,
      body: {
        size: options.limit ?? 20,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ['title^2', 'content'],
                  fuzziness: 'AUTO',
                },
              },
            ],
            filter: [{ term: { organizationId } }],
          },
        },
      },
    });

    return response.body.hits.hits.map((hit: any) => ({
      id: hit._id,
      score: hit._score ?? 0,
      source: hit._source,
    }));
  }
}
