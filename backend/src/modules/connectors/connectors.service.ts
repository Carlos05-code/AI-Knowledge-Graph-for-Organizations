import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ConnectorRegistryService } from '../../infrastructure/connectors/connector-registry.service';
import { ConnectorConfig } from '../../infrastructure/connectors/connector-adapter.interface';
import { ConnectorDocument } from '../../infrastructure/connectors/connector-adapter.interface';
import { ConnectorType } from '../../domain/entities/connector.entity';
import { DocumentSource } from '../../domain/entities/document.entity';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 64;

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);

  constructor(
    private prisma: PrismaService,
    private registry: ConnectorRegistryService,
  ) {}

  async create(organizationId: string, dto: CreateConnectorDto) {
    return this.prisma.connector.create({
      data: {
        name: dto.name,
        type: dto.type,
        organizationId,
        credentials: dto.credentials,
        config: (dto.config || {}) as Prisma.InputJsonValue,
        syncInterval: dto.syncInterval,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.connector.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        runs: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async findById(id: string, organizationId: string) {
    return this.prisma.connector.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateConnectorDto) {
    await this.assertOwned(id, organizationId);
    return this.prisma.connector.update({
      where: { id },
      data: {
        ...dto,
        config: dto.config as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async delete(id: string, organizationId: string) {
    await this.assertOwned(id, organizationId);
    return this.prisma.connector.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async testConnection(id: string, organizationId: string) {
    const connector = await this.assertOwned(id, organizationId);
    const adapter = this.registry.getAdapter(
      connector.type,
      this.configOf(connector),
    );
    try {
      const detail = await adapter.authenticate();
      return { success: true, type: connector.type, detail };
    } catch (error) {
      throw new BadRequestException(
        `Connection test failed: ${(error as Error).message}`,
      );
    }
  }

  async sync(id: string, organizationId: string) {
    const connector = await this.assertOwned(id, organizationId);

    const run = await this.prisma.connectorRun.create({
      data: {
        connectorId: id,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      const adapter = this.registry.getAdapter(
        connector.type,
        this.configOf(connector),
      );
      const result = await adapter.syncAll();

      let documentsSynced = 0;
      if (result.documents) {
        for (const document of result.documents) {
          await this.persistDocument(connector, document, organizationId);
          documentsSynced += 1;
        }
      } else {
        documentsSynced = result.documentsSynced ?? 0;
      }

      await this.prisma.connectorRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          documentsSynced,
          errorCount: result.errors.length,
          errorLog:
            result.errors.length > 0
              ? result.errors.map((e) => `${e.fileId}: ${e.error}`).join('\n')
              : undefined,
          metadata: result.metadata as Prisma.InputJsonValue,
        },
      });

      await this.prisma.connector.update({
        where: { id },
        data: { lastSyncAt: new Date() },
      });

      this.logger.log(
        `Connector ${connector.name} (${connector.type}) synced ${documentsSynced} documents, ${result.errors.length} errors`,
      );

      return { runId: run.id, documentsSynced, errors: result.errors };
    } catch (error) {
      await this.prisma.connectorRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorLog: (error as Error).message,
        },
      });
      this.logger.warn(
        `Connector ${id} (${connector.type}) sync failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async getRunHistory(connectorId: string, organizationId: string) {
    return this.prisma.connectorRun.findMany({
      where: { connector: { id: connectorId, organizationId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  private async assertOwned(id: string, organizationId: string) {
    const connector = await this.prisma.connector.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!connector) throw new NotFoundException('Connector not found');
    return connector;
  }

  private configOf(connector: {
    type: string;
    credentials: string;
    config: Prisma.JsonValue;
  }): ConnectorConfig {
    let parsed: ConnectorConfig;
    try {
      parsed = JSON.parse(connector.credentials) as ConnectorConfig;
    } catch {
      // fall back to raw token-style credentials when not JSON
      parsed = { accessToken: connector.credentials };
    }
    const config =
      connector.config && typeof connector.config === 'object'
        ? (connector.config as Record<string, unknown>)
        : {};
    return { ...config, ...parsed };
  }

  private sourceForType(type: string): DocumentSource {
    switch (type) {
      case ConnectorType.GOOGLE_DRIVE:
        return DocumentSource.GOOGLE_DRIVE;
      case ConnectorType.SHAREPOINT:
        return DocumentSource.SHAREPOINT;
      case ConnectorType.SLACK:
        return DocumentSource.SLACK;
      case ConnectorType.TEAMS:
        return DocumentSource.TEAMS;
      case ConnectorType.NOTION:
        return DocumentSource.NOTION;
      case ConnectorType.CONFLUENCE:
        return DocumentSource.CONFLUENCE;
      case ConnectorType.GITHUB:
        return DocumentSource.GITHUB;
      case ConnectorType.GITLAB:
        return DocumentSource.GITLAB;
      case ConnectorType.JIRA:
        return DocumentSource.JIRA;
      case ConnectorType.LINEAR:
        return DocumentSource.LINEAR;
      default:
        return DocumentSource.UPLOAD;
    }
  }

  private async persistDocument(
    connector: { id: string; type: string },
    document: ConnectorDocument,
    organizationId: string,
  ) {
    const checksum = createHash('sha256')
      .update(document.content)
      .digest('hex');
    const doc = await this.prisma.document.create({
      data: {
        title: document.name,
        description: `Synced from ${connector.type} connector`,
        filePath: document.filePath,
        fileType: document.fileType || 'txt',
        fileSize: document.size,
        mimeType: document.mimeType || 'text/plain',
        checksum,
        source: this.sourceForType(connector.type),
        sourceUrl: document.sourceUrl,
        status: 'INDEXED',
        isIndexed: true,
        organizationId,
        metadata: {
          connectorId: connector.id,
          connectorType: connector.type,
          ...(document.metadata || {}),
        },
      },
    });

    const chunks = this.chunkContent(doc.id, document.content);
    if (chunks.length > 0) {
      await this.prisma.chunk.createMany({
        data: chunks,
      });
    }

    return doc;
  }

  private chunkContent(documentId: string, content: string) {
    const chunks: Array<{
      id: string;
      documentId: string;
      content: string;
      index: number;
      tokenCount: number;
    }> = [];
    const lines = content.split('\n').filter(Boolean);
    let currentChunk = '';

    for (const line of lines) {
      if (
        currentChunk.length + line.length > CHUNK_SIZE &&
        currentChunk.length > 0
      ) {
        const id = `${documentId}_chunk_${chunks.length}`;
        chunks.push({
          id,
          documentId,
          content: currentChunk.trim(),
          index: chunks.length,
          tokenCount: currentChunk.trim().split(/\s+/).length,
        });
        currentChunk = currentChunk.slice(-CHUNK_OVERLAP);
      }
      currentChunk += (currentChunk ? '\n' : '') + line;
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${documentId}_chunk_${chunks.length}`,
        documentId,
        content: currentChunk.trim(),
        index: chunks.length,
        tokenCount: currentChunk.trim().split(/\s+/).length,
      });
    }

    if (chunks.length === 0) {
      chunks.push({
        id: `${documentId}_chunk_0`,
        documentId,
        content: content.slice(0, CHUNK_SIZE),
        index: 0,
        tokenCount: content.slice(0, CHUNK_SIZE).split(/\s+/).length,
      });
    }

    return chunks;
  }
}
