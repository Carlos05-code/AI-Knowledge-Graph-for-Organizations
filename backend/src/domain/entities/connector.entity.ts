import { AggregateRoot } from '@nestjs/cqrs';

export enum ConnectorType {
  GOOGLE_DRIVE = 'GOOGLE_DRIVE',
  ONEDRIVE = 'ONEDRIVE',
  SHAREPOINT = 'SHAREPOINT',
  GMAIL = 'GMAIL',
  OUTLOOK = 'OUTLOOK',
  SLACK = 'SLACK',
  TEAMS = 'TEAMS',
  DROPBOX = 'DROPBOX',
  NOTION = 'NOTION',
  CONFLUENCE = 'CONFLUENCE',
  GITHUB = 'GITHUB',
  GITLAB = 'GITLAB',
  JIRA = 'JIRA',
  LINEAR = 'LINEAR',
  CUSTOM = 'CUSTOM',
}

export interface ConnectorProps {
  id?: string;
  name: string;
  type: ConnectorType;
  organizationId: string;
  credentials: string;
  config?: Record<string, unknown>;
  isEnabled?: boolean;
  lastSyncAt?: Date | null;
  syncInterval?: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class Connector extends AggregateRoot {
  readonly id: string;
  readonly name: string;
  readonly type: ConnectorType;
  readonly organizationId: string;
  readonly credentials: string;
  readonly config: Record<string, unknown>;
  readonly isEnabled: boolean;
  readonly lastSyncAt?: Date | null;
  readonly syncInterval?: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date | null;

  constructor(props: ConnectorProps) {
    super();
    this.id = props.id || crypto.randomUUID();
    this.name = props.name;
    this.type = props.type;
    this.organizationId = props.organizationId;
    this.credentials = props.credentials;
    this.config = props.config ?? {};
    this.isEnabled = props.isEnabled ?? true;
    this.lastSyncAt = props.lastSyncAt ?? null;
    this.syncInterval = props.syncInterval;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }
}
