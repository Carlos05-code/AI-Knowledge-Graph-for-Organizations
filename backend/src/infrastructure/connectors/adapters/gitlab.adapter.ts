import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const DEFAULT_FILE_LIMIT = 50;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

interface GitLabTreeItem {
  id: string;
  name: string;
  type: 'blob' | 'tree';
  path: string;
}

export class GitLabAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(GitLabAdapter.name);

  constructor(config: ConnectorConfig) {
    super(config, 'GITLAB');
  }

  private get token(): string {
    const token = (this.config.accessToken || this.config.token) as string;
    if (!token) {
      throw new Error(
        'GitLab token is missing. Provide `token` or `accessToken` in credentials.',
      );
    }
    return token;
  }

  private get apiBase(): string {
    const host = (
      (this.config.baseUrl as string) || 'https://gitlab.com'
    ).replace(/\/$/, '');
    return `${host}/api/v4`;
  }

  private get projectId(): string {
    const explicit = this.config.projectId as string | number | undefined;
    if (explicit !== undefined) return encodeURIComponent(String(explicit));
    const path = this.config.defaultProject as string | undefined;
    if (!path) {
      throw new Error(
        'GitLab project is missing. Provide `projectId` (numeric) or `defaultProject` (e.g. "group/project") in credentials.',
      );
    }
    return encodeURIComponent(path);
  }

  private get ref(): string {
    return (
      (this.config.ref as string) || (this.config.branch as string) || 'main'
    );
  }

  private get limit(): number {
    const n = Number(this.config.limit ?? DEFAULT_FILE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_FILE_LIMIT;
    return Math.min(Math.max(n, 1), 200);
  }

  private async api<T>(path: string): Promise<T> {
    const response = await fetch(`${this.apiBase}${path}`, {
      headers: { 'PRIVATE-TOKEN': this.token },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.warn(`GitLab API ${path} failed: HTTP ${response.status}`);
      throw new Error(
        `GitLab API ${path} failed: HTTP ${response.status} ${body.slice(0, 200)}`,
      );
    }
    return (await response.json()) as T;
  }

  async authenticate(): Promise<{
    ok: boolean;
    id?: number;
    username?: string;
  }> {
    const res = await this.api<{ id: number; username: string }>('/user');
    return { ok: true, id: res.id, username: res.username };
  }

  refreshAccessToken(): Promise<void> {
    // Personal/project access tokens are long-lived within their expiry;
    // no refresh flow for this adapter.
    this.logger.log(
      'GitLabAdapter: token refresh no-op (personal access token)',
    );
    return Promise.resolve();
  }

  private async listTree(): Promise<GitLabTreeItem[]> {
    const params = new URLSearchParams({
      recursive: 'true',
      per_page: String(this.limit),
      ref: this.ref,
    });
    const items = await this.api<GitLabTreeItem[]>(
      `/projects/${this.projectId}/repository/tree?${params.toString()}`,
    );
    return items.filter((i) => i.type === 'blob').slice(0, this.limit);
  }

  private toFile(item: GitLabTreeItem): ConnectorFile {
    return {
      id: item.path,
      name: item.name,
      mimeType: 'text/plain',
      size: 0,
      path: item.path,
      metadata: { blobId: item.id },
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    const items = await this.listTree();
    return items.map((i) => this.toFile(i));
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({ ref: this.ref });
    return this.api<Record<string, unknown>>(
      `/projects/${this.projectId}/repository/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    );
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    const items = await this.listTree();
    const needle = query.toLowerCase();
    return items
      .filter((i) => i.path.toLowerCase().includes(needle))
      .map((i) => this.toFile(i));
  }

  private async fetchRawContent(filePath: string): Promise<Buffer> {
    const params = new URLSearchParams({ ref: this.ref });
    const response = await fetch(
      `${this.apiBase}/projects/${this.projectId}/repository/files/${encodeURIComponent(filePath)}/raw?${params.toString()}`,
      { headers: { 'PRIVATE-TOKEN': this.token } },
    );
    if (!response.ok) {
      throw new Error(
        `GitLab raw file fetch failed for ${filePath} (HTTP ${response.status})`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `File ${filePath} exceeds the ${MAX_DOWNLOAD_BYTES} byte download limit`,
      );
    }
    return bytes;
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    return this.fetchRawContent(fileId);
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];
    const metadata: Record<string, unknown> = { skippedBinary: 0 };

    const items = await this.listTree();
    metadata.filesFound = items.length;

    for (const item of items) {
      try {
        const bytes = await this.fetchRawContent(item.path);
        if (bytes.includes(0)) {
          metadata.skippedBinary = (metadata.skippedBinary as number) + 1;
          continue;
        }
        documents.push({
          id: item.path,
          name: item.name,
          filePath: item.path,
          mimeType: 'text/plain',
          fileType: item.name.split('.').pop() || 'txt',
          size: bytes.length,
          content: bytes.toString('utf-8'),
          metadata: { blobId: item.id },
        });
      } catch (error) {
        errors.push({ fileId: item.path, error: (error as Error).message });
      }
    }

    return { documentsSynced: documents.length, errors, metadata, documents };
  }
}
