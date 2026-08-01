import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private openai: any = null;

  constructor(private config: ConfigService) {
    const apiKey = config.get('OPENAI_API_KEY');
    if (apiKey) {
      try {
        const OpenAI = require('openai').OpenAI;
        this.openai = new OpenAI({ apiKey });
      } catch {
        this.logger.warn('OpenAI not available, embeddings disabled');
      }
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      return this.fallbackEmbedding(text);
    }
    try {
      const response = await this.openai.embeddings.create({
        model: this.config.get('EMBEDDING_MODEL', 'text-embedding-3-small'),
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error('OpenAI embedding failed, using fallback', error);
      return this.fallbackEmbedding(text);
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openai || texts.length === 0) {
      return texts.map((t) => this.fallbackEmbedding(t));
    }
    try {
      const response = await this.openai.embeddings.create({
        model: this.config.get('EMBEDDING_MODEL', 'text-embedding-3-small'),
        input: texts,
      });
      return response.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding);
    } catch (error) {
      this.logger.error('OpenAI batch embedding failed', error);
      return texts.map((t) => this.fallbackEmbedding(t));
    }
  }

  private fallbackEmbedding(text: string): number[] {
    const dim = this.config.get('EMBEDDING_DIMENSION', 1536);
    const hash = this.simpleHash(text);
    const embedding: number[] = [];
    for (let i = 0; i < dim; i++) {
      const val = Math.sin(hash * (i + 1)) * 0.5 + 0.5;
      embedding.push(val);
    }
    const magnitude = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    return embedding.map((v) => v / (magnitude || 1));
  }

  private simpleHash(text: string): number {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) / 2147483647;
  }
}
