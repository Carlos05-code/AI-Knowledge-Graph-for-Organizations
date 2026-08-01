import { BaseEvent } from './base.event';

export class DocumentUploadedEvent extends BaseEvent {
  readonly eventName = 'document.uploaded';
  constructor(
    public readonly documentId: string,
    public readonly organizationId: string,
    public readonly userId: string,
    public readonly title: string,
    public readonly fileType: string,
    public readonly fileSize: number,
  ) {
    super();
  }
}

export class DocumentProcessedEvent extends BaseEvent {
  readonly eventName = 'document.processed';
  constructor(
    public readonly documentId: string,
    public readonly organizationId: string,
    public readonly status: string,
    public readonly chunksCount: number,
    public readonly duration: number,
  ) {
    super();
  }
}

export class DocumentDeletedEvent extends BaseEvent {
  readonly eventName = 'document.deleted';
  constructor(
    public readonly documentId: string,
    public readonly organizationId: string,
    public readonly userId: string,
  ) {
    super();
  }
}

export class ConnectorSyncStartedEvent extends BaseEvent {
  readonly eventName = 'connector.sync.started';
  constructor(
    public readonly connectorId: string,
    public readonly connectorType: string,
    public readonly organizationId: string,
  ) {
    super();
  }
}

export class ConnectorSyncCompletedEvent extends BaseEvent {
  readonly eventName = 'connector.sync.completed';
  constructor(
    public readonly connectorId: string,
    public readonly runId: string,
    public readonly documentsSynced: number,
    public readonly errors: number,
  ) {
    super();
  }
}

export class MessageSentEvent extends BaseEvent {
  readonly eventName = 'message.sent';
  constructor(
    public readonly conversationId: string,
    public readonly userId: string,
    public readonly role: string,
    public readonly contentLength: number,
  ) {
    super();
  }
}

export class PolicyUpdatedEvent extends BaseEvent {
  readonly eventName = 'policy.updated';
  constructor(
    public readonly policyId: string,
    public readonly organizationId: string,
    public readonly version: number,
  ) {
    super();
  }
}

export class MeetingCreatedEvent extends BaseEvent {
  readonly eventName = 'meeting.created';
  constructor(
    public readonly meetingId: string,
    public readonly title: string,
    public readonly organizationId: string,
    public readonly organizerId: string,
    public readonly participantCount: number,
  ) {
    super();
  }
}
