import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ConnectorType } from '../../domain/entities/connector.entity';

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);

  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    type: ConnectorType;
    organizationId: string;
    credentials: string;
    config?: Record<string, unknown>;
    syncInterval?: number;
  }) {
    return this.prisma.connector.create({
      data: {
        name: data.name,
        type: data.type,
        organizationId: data.organizationId,
        credentials: data.credentials,
        config: (data.config || {}) as Prisma.InputJsonValue,
        syncInterval: data.syncInterval,
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

  async update(id: string, organizationId: string, data: {
    name?: string;
    config?: Record<string, unknown>;
    isEnabled?: boolean;
    syncInterval?: number;
  }) {
    return this.prisma.connector.update({
      where: { id },
      data: {
        ...data,
        config: data.config as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async delete(id: string, organizationId: string) {
    return this.prisma.connector.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async sync(id: string, organizationId: string) {
    const connector = await this.prisma.connector.findFirst({
      where: { id, organizationId },
    });
    if (!connector) throw new Error('Connector not found');

    const run = await this.prisma.connectorRun.create({
      data: {
        connectorId: id,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    try {
      // In production, this would call the specific connector implementation
      // e.g., GoogleDriveConnector.sync(connector)
      const syncedCount = await this.executeSync(connector);

      await this.prisma.connectorRun.update({
        where: { id: run.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          documentsSynced: syncedCount,
        },
      });

      await this.prisma.connector.update({
        where: { id },
        data: { lastSyncAt: new Date() },
      });

      return { runId: run.id, documentsSynced: syncedCount };
    } catch (error: any) {
      await this.prisma.connectorRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorLog: error.message,
        },
      });
      throw error;
    }
  }

  private async executeSync(_connector: any): Promise<number> {
    // Integration point for connector-specific sync logic
    return 0;
  }

  async getRunHistory(connectorId: string, organizationId: string) {
    return this.prisma.connectorRun.findMany({
      where: { connector: { id: connectorId, organizationId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}
