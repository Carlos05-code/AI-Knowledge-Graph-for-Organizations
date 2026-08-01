import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import {
  DocumentUploadedEvent,
  DocumentProcessedEvent,
  DocumentDeletedEvent,
  ConnectorSyncCompletedEvent,
  PolicyUpdatedEvent,
  MeetingCreatedEvent,
} from '../domain-events';

@Injectable()
export class AuditLogHandler {
  private readonly logger = new Logger(AuditLogHandler.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent('document.uploaded')
  async handleDocumentUploaded(event: DocumentUploadedEvent) {
    await this.createAuditLog({
      organizationId: event.organizationId,
      userId: event.userId,
      action: 'DOCUMENT_UPLOADED',
      entity: 'document',
      entityId: event.documentId,
      changes: { title: event.title, fileType: event.fileType, fileSize: event.fileSize },
    });
  }

  @OnEvent('document.processed')
  async handleDocumentProcessed(event: DocumentProcessedEvent) {
    await this.createAuditLog({
      organizationId: event.organizationId,
      action: 'DOCUMENT_PROCESSED',
      entity: 'document',
      entityId: event.documentId,
      changes: { status: event.status, chunksCount: event.chunksCount, duration: event.duration },
    });
  }

  @OnEvent('document.deleted')
  async handleDocumentDeleted(event: DocumentDeletedEvent) {
    await this.createAuditLog({
      organizationId: event.organizationId,
      userId: event.userId,
      action: 'DOCUMENT_DELETED',
      entity: 'document',
      entityId: event.documentId,
    });
  }

  @OnEvent('connector.sync.completed')
  async handleConnectorSync(event: ConnectorSyncCompletedEvent) {
    await this.createAuditLog({
      action: 'CONNECTOR_SYNC_COMPLETED',
      entity: 'connector',
      entityId: event.connectorId,
      changes: { runId: event.runId, documentsSynced: event.documentsSynced, errors: event.errors },
    });
  }

  @OnEvent('policy.updated')
  async handlePolicyUpdated(event: PolicyUpdatedEvent) {
    await this.createAuditLog({
      organizationId: event.organizationId,
      action: 'POLICY_UPDATED',
      entity: 'policy',
      entityId: event.policyId,
      changes: { version: event.version },
    });
  }

  @OnEvent('meeting.created')
  async handleMeetingCreated(event: MeetingCreatedEvent) {
    await this.createAuditLog({
      organizationId: event.organizationId,
      userId: event.organizerId,
      action: 'MEETING_CREATED',
      entity: 'meeting',
      entityId: event.meetingId,
      changes: { title: event.title, participantCount: event.participantCount },
    });
  }

  private async createAuditLog(data: {
    organizationId?: string;
    userId?: string;
    action: string;
    entity: string;
    entityId?: string;
    changes?: Record<string, unknown>;
  }) {
    if (!data.organizationId) return;
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: data.organizationId,
          userId: data.userId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          changes: data.changes as any,
        },
      });
    } catch (error) {
      this.logger.error('Failed to write audit log', error);
    }
  }
}
