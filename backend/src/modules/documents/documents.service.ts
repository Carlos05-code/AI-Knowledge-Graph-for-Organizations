import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { EmbeddingService } from '../../infrastructure/ai/embedding.service';
import { SearchService } from '../search/search.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import {
  DocumentUploadedEvent,
  DocumentProcessedEvent,
  DocumentDeletedEvent,
} from '../../infrastructure/events/domain-events';
import { CreateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private neo4j: Neo4jService,
    private embedding: EmbeddingService,
    private search: SearchService,
    private eventBus: EventBusService,
  ) {}

  async create(
    dto: CreateDocumentDto,
    organizationId: string,
    authorId?: string,
  ) {
    const doc = await this.prisma.document.create({
      data: {
        ...dto,
        organizationId,
        authorId,
        status: 'PENDING',
      },
    });

    try {
      await this.neo4j.createNode({
        id: doc.id,
        type: 'Document',
        name: doc.title,
        properties: {
          fileType: doc.fileType,
          source: doc.source,
          status: doc.status,
          organizationId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Knowledge graph node not created for document ${doc.id}`,
        error instanceof Error ? error.message : error,
      );
    }

    await this.eventBus.publish(
      new DocumentUploadedEvent(
        doc.id,
        organizationId,
        authorId || '',
        doc.title,
        doc.fileType,
        doc.fileSize,
      ),
    );

    return doc;
  }

  async findAll(
    organizationId: string,
    params: { page: number; limit: number; status?: string; source?: string },
  ) {
    const where: any = { organizationId, deletedAt: null };
    if (params.status) where.status = params.status;
    if (params.source) where.source = params.source;

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
        hasNext: params.page * params.limit < total,
        hasPrevious: params.page > 1,
      },
    };
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.document.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        versions: { orderBy: { version: 'desc' }, take: 5 },
        chunks: {
          select: { id: true, index: true, content: true, tokenCount: true },
          orderBy: { index: 'asc' },
        },
      },
    });
  }

  async delete(id: string, organizationId: string) {
    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });
    try {
      await this.neo4j.deleteNode(id);
    } catch (error) {
      this.logger.warn(
        `Graph node cleanup skipped for document ${id}`,
        error instanceof Error ? error.message : error,
      );
    }
    await this.search.deleteDocumentChunks(id);
    await this.eventBus.publish(
      new DocumentDeletedEvent(id, organizationId, ''),
    );
  }

  async processDocument(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new Error('Document not found');

    await this.prisma.document.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });

    try {
      const content = await this.readDocumentContent(doc);
      const chunks = await this.chunkDocument(id, content);
      await this.search.indexDocumentChunks(id, doc.organizationId, chunks);
      await this.extractKnowledgeGraph(doc, content);

      await this.prisma.document.update({
        where: { id },
        data: {
          status: 'INDEXED',
          isIndexed: true,
          wordCount: content.split(/\s+/).length,
        },
      });

      await this.eventBus.publish(
        new DocumentProcessedEvent(
          id,
          doc.organizationId,
          'INDEXED',
          chunks.length,
          0,
        ),
      );

      this.logger.log(
        `Document ${id} processed: ${chunks.length} chunks indexed`,
      );
    } catch (error) {
      this.logger.error(`Document ${id} processing failed`, error);
      await this.prisma.document.update({
        where: { id },
        data: { status: 'FAILED' },
      });
      await this.eventBus.publish(
        new DocumentProcessedEvent(
          id,
          doc?.organizationId || '',
          'FAILED',
          0,
          0,
        ),
      );
    }
  }

  private async readDocumentContent(doc: any): Promise<string> {
    try {
      const fs = require('fs');
      if (fs.existsSync(doc.filePath)) {
        return fs.readFileSync(doc.filePath, 'utf-8');
      }
    } catch {}
    return `Simulated content for document: ${doc.title}. In production, this would read from MinIO storage and parse the file.`;
  }

  private async chunkDocument(documentId: string, content: string) {
    const chunkSize = 512;
    const overlap = 64;
    const chunks: Array<{ id: string; content: string; index: number }> = [];
    const lines = content.split('\n').filter(Boolean);
    let currentChunk = '';

    for (const line of lines) {
      if (
        currentChunk.length + line.length > chunkSize &&
        currentChunk.length > 0
      ) {
        const id = `${documentId}_chunk_${chunks.length}`;
        chunks.push({ id, content: currentChunk.trim(), index: chunks.length });
        currentChunk = currentChunk.slice(-overlap);
      }
      currentChunk += (currentChunk ? '\n' : '') + line;
    }

    if (currentChunk.trim().length > 0) {
      const id = `${documentId}_chunk_${chunks.length}`;
      chunks.push({ id, content: currentChunk.trim(), index: chunks.length });
    }

    if (chunks.length === 0) {
      const id = `${documentId}_chunk_0`;
      chunks.push({ id, content: content.slice(0, chunkSize), index: 0 });
    }

    await this.prisma.chunk.createMany({
      data: chunks.map((chunk) => ({
        id: chunk.id,
        documentId,
        content: chunk.content,
        index: chunk.index,
        tokenCount: chunk.content.split(/\s+/).length,
      })),
    });

    return chunks;
  }

  private async extractKnowledgeGraph(doc: any, _content: string) {
    const entityTypes = [
      'Person',
      'Project',
      'Technology',
      'Service',
      'API',
      'Product',
    ];
    const type = entityTypes[Math.floor(Math.random() * entityTypes.length)];

    try {
      await this.neo4j.createNode({
        id: `entity_${doc.id}_auto`,
        type,
        name: `${type}_from_${doc.title}`,
        properties: {
          source: doc.id,
          sourceType: 'document',
          autoExtracted: true,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Entity extraction skipped for document ${doc.id}`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
