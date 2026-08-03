export interface ConnectorConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  accessToken?: string;
  refreshToken?: string;
  scopes?: string[];
  [key: string]: unknown;
}

export interface ConnectorDocument {
  id: string;
  name: string;
  filePath: string;
  mimeType: string;
  fileType: string;
  size: number;
  content: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  documentsSynced: number;
  errors: Array<{ fileId: string; error: string }>;
  metadata: Record<string, unknown>;
  documents?: ConnectorDocument[];
}

export interface SyncProgress {
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalFiles?: number;
  processedFiles?: number;
  currentFile?: string;
  error?: string;
}

export interface ConnectorFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
  parentId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  content?: Buffer;
  metadata?: Record<string, unknown>;
}

export abstract class ConnectorAdapter {
  protected config: ConnectorConfig;
  protected type: string;

  constructor(config: ConnectorConfig, type: string) {
    this.config = config;
    this.type = type;
  }

  abstract authenticate(): Promise<unknown>;
  abstract refreshAccessToken(): Promise<void>;
  abstract listFiles(folderId?: string): Promise<ConnectorFile[]>;
  abstract downloadFile(fileId: string): Promise<Buffer>;
  abstract getFileMetadata(fileId: string): Promise<Record<string, unknown>>;
  abstract searchFiles(query: string): Promise<ConnectorFile[]>;
  abstract syncAll(): Promise<SyncResult>;

  getType(): string {
    return this.type;
  }

  isAuthenticated(): boolean {
    return !!this.config.accessToken;
  }
}
