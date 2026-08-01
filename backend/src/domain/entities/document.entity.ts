import { AggregateRoot } from '@nestjs/cqrs';

export enum DocumentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  INDEXED = 'INDEXED',
  FAILED = 'FAILED',
  DELETED = 'DELETED',
}

export enum DocumentSource {
  UPLOAD = 'UPLOAD',
  GOOGLE_DRIVE = 'GOOGLE_DRIVE',
  ONEDRIVE = 'ONEDRIVE',
  SHAREPOINT = 'SHAREPOINT',
  SLACK = 'SLACK',
  TEAMS = 'TEAMS',
  NOTION = 'NOTION',
  CONFLUENCE = 'CONFLUENCE',
  GITHUB = 'GITHUB',
  GITLAB = 'GITLAB',
  JIRA = 'JIRA',
  LINEAR = 'LINEAR',
  DROPBOX = 'DROPBOX',
  EMAIL = 'EMAIL',
  MEETING = 'MEETING',
}

export interface DocumentProps {
  id?: string;
  title: string;
  description?: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  checksum: string;
  status?: DocumentStatus;
  authorId?: string;
  organizationId: string;
  workspaceId?: string;
  source?: DocumentSource;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
  pageCount?: number;
  wordCount?: number;
  language?: string;
  isIndexed?: boolean;
  isEncrypted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class Document extends AggregateRoot {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly filePath: string;
  readonly fileType: string;
  readonly fileSize: number;
  readonly mimeType: string;
  readonly checksum: string;
  readonly status: DocumentStatus;
  readonly authorId?: string;
  readonly organizationId: string;
  readonly workspaceId?: string;
  readonly source: DocumentSource;
  readonly sourceUrl?: string;
  readonly metadata: Record<string, unknown>;
  readonly pageCount?: number;
  readonly wordCount?: number;
  readonly language?: string;
  readonly isIndexed: boolean;
  readonly isEncrypted: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date | null;

  constructor(props: DocumentProps) {
    super();
    this.id = props.id || crypto.randomUUID();
    this.title = props.title;
    this.description = props.description;
    this.filePath = props.filePath;
    this.fileType = props.fileType;
    this.fileSize = props.fileSize;
    this.mimeType = props.mimeType;
    this.checksum = props.checksum;
    this.status = props.status ?? DocumentStatus.PENDING;
    this.authorId = props.authorId;
    this.organizationId = props.organizationId;
    this.workspaceId = props.workspaceId;
    this.source = props.source ?? DocumentSource.UPLOAD;
    this.sourceUrl = props.sourceUrl;
    this.metadata = props.metadata ?? {};
    this.pageCount = props.pageCount;
    this.wordCount = props.wordCount;
    this.language = props.language;
    this.isIndexed = props.isIndexed ?? false;
    this.isEncrypted = props.isEncrypted ?? false;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }
}
