import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const API_BASE = 'https://api.dropboxapi.com/2';
const CONTENT_BASE = 'https://content.dropboxapi.com/2';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const DEFAULT_FILE_LIMIT = 100;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const TOKEN_EXPIRY_SKEW_MS = 60_000;

interface DropboxEntry {
  '.tag': 'file' | 'folder' | 'deleted';
  id?: string;
  name: string;
  path_lower?: string;
  size?: number;
  server_modified?: string;
  client_modified?: string;
}

interface DropboxListFolderResult {
  entries: DropboxEntry[];
  has_more: boolean;
  cursor: string;
}

/**
 * Dropbox API v2. Short-lived access tokens (~4h) are refreshed via
 * `refreshToken` + `clientId`/`clientSecret` when given; a long-lived
 * `accessToken` also works for setups that manage rotation externally.
 */
export class DropboxAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(DropboxAdapter.name);
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: ConnectorConfig) {
    super(config, 'DROPBOX');
  }

  private get limit(): number {
    const n = Number(this.config.limit ?? DEFAULT_FILE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_FILE_LIMIT;
    return Math.min(Math.max(n, 1), 500);
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.accessToken &&
      Date.now() < this.tokenExpiresAt - TOKEN_EXPIRY_SKEW_MS
    ) {
      return this.accessToken;
    }

    const refreshToken = this.config.refreshToken;
    if (!refreshToken) {
      const token = this.config.accessToken;
      if (!token) {
        throw new Error(
          'Dropbox token is missing. Provide `accessToken`, or `refreshToken` + `clientId` + `clientSecret`, in credentials.',
        );
      }
      this.accessToken = token;
      this.tokenExpiresAt = Infinity; // externally managed; no expiry info available
      return token;
    }

    const clientId = this.config.clientId as string;
    const clientSecret = this.config.clientSecret as string;
    if (!clientId || !clientSecret) {
      throw new Error(
        'Dropbox app key/secret is missing. Provide `clientId` and `clientSecret` to refresh `refreshToken`.',
      );
    }

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    const json = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error_summary?: string;
    };
    if (!response.ok || !json.access_token) {
      const message = json.error_summary || `HTTP ${response.status}`;
      this.logger.warn(`Dropbox token refresh failed: ${message}`);
      throw new Error(`Dropbox token refresh failed: ${message}`);
    }

    this.accessToken = json.access_token;
    this.tokenExpiresAt = Date.now() + (json.expires_in ?? 14400) * 1000;
    return this.accessToken;
  }

  async authenticate(): Promise<{
    ok: boolean;
    accountId?: string;
    name?: string;
  }> {
    const res = await this.api<{
      account_id: string;
      name?: { display_name?: string };
    }>('/users/get_current_account', {});
    return {
      ok: true,
      accountId: res.account_id,
      name: res.name?.display_name,
    };
  }

  async refreshAccessToken(): Promise<void> {
    await this.getAccessToken(true);
  }

  private async api<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      this.logger.warn(`Dropbox API ${path} failed: HTTP ${response.status}`);
      throw new Error(
        `Dropbox API ${path} failed: HTTP ${response.status} ${errBody.slice(0, 200)}`,
      );
    }
    return (await response.json()) as T;
  }

  private async listEntries(): Promise<DropboxEntry[]> {
    const entries: DropboxEntry[] = [];
    let result = await this.api<DropboxListFolderResult>('/files/list_folder', {
      path: this.config.folderPath || '',
      recursive: true,
      limit: this.limit,
    });
    entries.push(...result.entries);

    while (result.has_more && entries.length < this.limit) {
      result = await this.api<DropboxListFolderResult>(
        '/files/list_folder/continue',
        { cursor: result.cursor },
      );
      entries.push(...result.entries);
    }

    return entries.filter((e) => e['.tag'] === 'file').slice(0, this.limit);
  }

  private toFile(entry: DropboxEntry): ConnectorFile {
    return {
      id: entry.id || entry.path_lower || entry.name,
      name: entry.name,
      mimeType: 'application/octet-stream',
      size: entry.size || 0,
      path: entry.path_lower || entry.name,
      updatedAt: entry.server_modified
        ? new Date(entry.server_modified)
        : undefined,
      metadata: {},
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    try {
      const entries = await this.listEntries();
      return entries.map((e) => this.toFile(e));
    } catch (error) {
      this.logger.error('Failed to list Dropbox files', error);
      return [];
    }
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    try {
      return await this.api<Record<string, unknown>>('/files/get_metadata', {
        path: fileId,
      });
    } catch {
      return {};
    }
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    try {
      const res = await this.api<{
        matches: Array<{ metadata: { metadata: DropboxEntry } }>;
      }>('/files/search_v2', {
        query,
        options: { max_results: this.limit },
      });
      return res.matches
        .map((m) => m.metadata.metadata)
        .filter((e) => e['.tag'] === 'file')
        .map((e) => this.toFile(e));
    } catch (error) {
      this.logger.warn('Dropbox search failed', error);
      return [];
    }
  }

  private async fetchRawContent(path: string): Promise<Buffer> {
    const token = await this.getAccessToken();
    const response = await fetch(`${CONTENT_BASE}/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path }),
      },
    });
    if (!response.ok) {
      throw new Error(
        `Dropbox download failed for ${path} (HTTP ${response.status})`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `File ${path} exceeds the ${MAX_DOWNLOAD_BYTES} byte download limit`,
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

    let entries: DropboxEntry[];
    try {
      entries = await this.listEntries();
    } catch (error) {
      return {
        documentsSynced: 0,
        errors: [{ fileId: 'root', error: (error as Error).message }],
        metadata,
      };
    }
    metadata.filesFound = entries.length;

    for (const entry of entries) {
      const path = entry.path_lower || entry.name;
      try {
        const bytes = await this.fetchRawContent(path);
        if (bytes.includes(0)) {
          metadata.skippedBinary = (metadata.skippedBinary as number) + 1;
          continue;
        }
        documents.push({
          id: entry.id || path,
          name: entry.name,
          filePath: path,
          mimeType: 'text/plain',
          fileType: entry.name.split('.').pop() || 'txt',
          size: bytes.length,
          content: bytes.toString('utf-8'),
          metadata: {},
        });
      } catch (error) {
        errors.push({ fileId: path, error: (error as Error).message });
      }
    }

    return { documentsSynced: documents.length, errors, metadata, documents };
  }
}
