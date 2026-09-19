import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { EmbeddingService } from '../../infrastructure/ai/embedding.service';
import { SearchService } from '../search/search.service';
import { EventBusService } from '../../infrastructure/events/event-bus.service';
import { OcrService } from '../../infrastructure/ocr/ocr.service';
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
    private ocr: OcrService,
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
    await this.prisma.chunk.deleteMany({ where: { documentId: id } });

    try {
      const { content, ocr } = await this.readDocumentContent(doc);
      const metadata = (doc.metadata || {}) as Record<string, unknown>;
      const ocrApplied =
        this.ocr.isOcrCandidate(doc.mimeType) &&
        doc.status !== 'INDEXED' &&
        !metadata.ocrExtracted;
      const chunks = await this.chunkDocument(id, content);
      await this.search.indexDocumentChunks(id, doc.organizationId, chunks);
      await this.extractKnowledgeGraph(doc, content);

      await this.prisma.document.update({
        where: { id },
        data: {
          status: 'INDEXED',
          isIndexed: true,
          wordCount: content.split(/\s+/).length,
          metadata: {
            ...metadata,
            ...(ocrApplied && ocr
              ? {
                  ocrExtracted: true,
                  ocrEngine: ocr.engine,
                  ...(ocr.pages !== undefined ? { ocrPages: ocr.pages } : {}),
                  ...(ocr.confidence !== undefined
                    ? { ocrConfidence: ocr.confidence }
                    : {}),
                }
              : {}),
          },
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

  private static readonly STRUCTURED_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]);

  private async readDocumentContent(doc: any): Promise<{
    content: string;
    ocr: { engine: string; pages?: number; confidence?: number } | null;
  }> {
    try {
      const fs = require('fs');
      if (fs.existsSync(doc.filePath)) {
        if (this.ocr.isOcrCandidate(doc.mimeType)) {
          const result = await this.ocr.extractText(doc.filePath);
          if (result && result.text.length > 0) {
            this.logger.log(
              `Document ${doc.id} OCR'd via ${result.engine}${
                result.pages ? ` (${result.pages} pages)` : ''
              }${result.confidence !== undefined ? `, confidence ${result.confidence}` : ''}`,
            );
            return {
              content: result.text,
              ocr: {
                engine: result.engine,
                pages: result.pages,
                confidence: result.confidence,
              },
            };
          }
          return {
            content: `No extractable text found in "${doc.title}" — OCR produced no text for this scanned file.`,
            ocr: null,
          };
        }
        if (DocumentsService.STRUCTURED_MIME_TYPES.has(doc.mimeType)) {
          const extracted = await this.extractStructuredText(
            doc.mimeType,
            doc.filePath,
          );
          return { content: extracted, ocr: null };
        }
        return { content: fs.readFileSync(doc.filePath, 'utf-8'), ocr: null };
      }
      this.logger.warn(
        `Document ${doc.id}'s file (${doc.filePath}) was not found on disk`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to read/parse document ${doc.id}`,
        error instanceof Error ? error.message : error,
      );
    }
    return {
      content: `No extractable content found for document: ${doc.title}. The source file could not be read or parsed.`,
      ocr: null,
    };
  }

  /** DOCX/PPTX/XLSX are ZIP-based binary formats — reading them as UTF-8 text
   *  (the plain-text fallback below) produces garbage, not real content. */
  private async extractStructuredText(
    mimeType: string,
    filePath: string,
  ): Promise<string> {
    switch (mimeType) {
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return this.extractDocx(filePath);
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        return this.extractPptx(filePath);
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return this.extractXlsx(filePath);
      default:
        return '';
    }
  }

  private async extractDocx(filePath: string): Promise<string> {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  /** ExcelJS cell values aren't always primitives — formulas, rich text and
   *  hyperlinks come back as objects that would silently stringify to
   *  "[object Object]" with a bare String(v). */
  private cellToText(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      if (typeof obj.text === 'string') return obj.text;
      if (Array.isArray(obj.richText)) {
        return (obj.richText as Array<{ text?: string }>)
          .map((r) => r.text ?? '')
          .join('');
      }
      if ('result' in obj) return this.cellToText(obj.result);
      return '';
    }
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    ) {
      return String(v);
    }
    return '';
  }

  private async extractXlsx(filePath: string): Promise<string> {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheets: string[] = [];
    workbook.eachSheet((sheet: any) => {
      const rows: string[] = [];
      sheet.eachRow((row: any) => {
        const cells = (row.values as unknown[])
          .slice(1)
          .map((v) => this.cellToText(v));
        rows.push(cells.join(', '));
      });
      sheets.push(`# ${sheet.name}\n${rows.join('\n')}`);
    });
    return sheets.join('\n\n');
  }

  private async extractPptx(filePath: string): Promise<string> {
    const fs = require('fs');
    const JSZip = require('jszip');
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);

    const slideNumber = (name: string) =>
      Number(name.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => slideNumber(a) - slideNumber(b));

    const slides = await Promise.all(
      slideFiles.map(async (name) => {
        const xml: string = await zip.files[name].async('string');
        const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
          .map((m) => m[1])
          .join(' ');
        return text;
      }),
    );

    return slides.map((text, i) => `[Slide ${i + 1}]\n${text}`).join('\n\n');
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
