import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import {
  DocumentProcessedEvent,
  ConnectorSyncCompletedEvent,
} from '../domain-events';

@Injectable()
export class NotificationHandler {
  private readonly logger = new Logger(NotificationHandler.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent('document.processed')
  async handleDocumentProcessed(event: DocumentProcessedEvent) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: event.organizationId, isActive: true },
      select: { id: true },
    });

    for (const user of users) {
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: 'DOCUMENT_CHANGED',
          title: 'Document Processed',
          message: `Document processing ${event.status === 'INDEXED' ? 'completed' : 'failed'}`,
          data: { documentId: event.documentId, status: event.status } as any,
        },
      });
    }
  }

  @OnEvent('connector.sync.completed')
  async handleConnectorSync(event: ConnectorSyncCompletedEvent) {
    try {
      const connector = await this.prisma.connector.findUnique({
        where: { id: event.connectorId },
        select: { organizationId: true, name: true },
      });
      if (!connector) return;

      const admins = await this.prisma.user.findMany({
        where: {
          organizationId: connector.organizationId,
          role: 'ADMIN',
          isActive: true,
        },
        select: { id: true },
      });

      for (const admin of admins) {
        await this.prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'SYNC_COMPLETED',
            title: `Sync Complete: ${connector.name}`,
            message: `Synced ${event.documentsSynced} documents with ${event.errors} errors`,
            data: {
              connectorId: event.connectorId,
              runId: event.runId,
              documentsSynced: event.documentsSynced,
              errors: event.errors,
            } as any,
          },
        });
      }
    } catch (error) {
      this.logger.error('Failed to create sync notification', error);
    }
  }
}
