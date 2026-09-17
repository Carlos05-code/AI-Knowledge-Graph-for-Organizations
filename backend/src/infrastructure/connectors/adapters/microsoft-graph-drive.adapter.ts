import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
const DEFAULT_FILE_LIMIT = 100;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const TOKEN_EXPIRY_SKEW_MS = 60_000;

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  folder?: unknown;
  file?: { mimeType?: string };
  webUrl?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
}

interface GraphDriveItemPage {
  value: GraphDriveItem[];
  '@odata.nextLink'?: string;
}

/**
 * Shared logic for the Microsoft Graph "drive" resource — OneDrive and
 * SharePoint document libraries are both exposed through the identical
 * /drive API shape, differing only in the base path (see the `driveBase`
 * getter each subclass provides). App-only (client-credentials) OAuth,
 * since this is a headless backend sync job, not a signed-in user.
 */
export abstract class MicrosoftGraphDriveAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(MicrosoftGraphDriveAdapter.name);
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: ConnectorConfig, type: string) {
    super(config, type);
  }

  /** e.g. `/drives/{driveId}` for OneDrive, `/sites/{siteId}/drive` for SharePoint. */
  protected abstract get driveBase(): string;

  private get tenantId(): string {
    const tenantId = this.config.tenantId as string;
    if (!tenantId) {
      throw new Error(
        'Microsoft tenant is missing. Provide `tenantId` in credentials.',
      );
    }
    return tenantId;
  }

  private get clientId(): string {
    const clientId = this.config.clientId as string;
    if (!clientId) {
      throw new Error(
        'Microsoft client ID is missing. Provide `clientId` in credentials.',
      );
    }
    return clientId;
  }

  private get clientSecret(): string {
    const clientSecret = this.config.clientSecret as string;
    if (!clientSecret) {
      throw new Error(
        'Microsoft client secret is missing. Provide `clientSecret` in credentials.',
      );
    }
    return clientSecret;
  }

  private get limit(): number {
    const n = Number(this.config.limit ?? DEFAULT_FILE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_FILE_LIMIT;
    return Math.min(Math.max(n, 1), 500);
  }

  async authenticate(): Promise<{ ok: boolean }> {
    await this.getAccessToken(true);
    return { ok: true };
  }

  async refreshAccessToken(): Promise<void> {
    await this.getAccessToken(true);
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.accessToken &&
      Date.now() < this.tokenExpiresAt - TOKEN_EXPIRY_SKEW_MS
    ) {
      return this.accessToken;
    }

    const response = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }).toString(),
      },
    );

    const json = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!response.ok || !json.access_token) {
      const message = json.error_description || `HTTP ${response.status}`;
      this.logger.warn(`Microsoft Graph token request failed: ${message}`);
      throw new Error(`Microsoft Graph token request failed: ${message}`);
    }

    this.accessToken = json.access_token;
    this.tokenExpiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }

  private async api<T>(path: string, absoluteUrl?: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = absoluteUrl || `${GRAPH_API_BASE}${this.driveBase}${path}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.warn(`Graph API ${path} failed: HTTP ${response.status}`);
      throw new Error(
        `Graph API ${path} failed: HTTP ${response.status} ${body.slice(0, 200)}`,
      );
    }
    return (await response.json()) as T;
  }

  private async listItems(path: string): Promise<GraphDriveItem[]> {
    const items: GraphDriveItem[] = [];
    let page = await this.api<GraphDriveItemPage>(path);
    items.push(...page.value);

    while (page['@odata.nextLink'] && items.length < this.limit) {
      page = await this.api<GraphDriveItemPage>('', page['@odata.nextLink']);
      items.push(...page.value);
    }

    return items.filter((item) => !item.folder).slice(0, this.limit);
  }

  private toFile(item: GraphDriveItem): ConnectorFile {
    return {
      id: item.id,
      name: item.name,
      mimeType: item.file?.mimeType || 'application/octet-stream',
      size: item.size || 0,
      path: item.name,
      createdAt: item.createdDateTime
        ? new Date(item.createdDateTime)
        : undefined,
      updatedAt: item.lastModifiedDateTime
        ? new Date(item.lastModifiedDateTime)
        : undefined,
      metadata: { webUrl: item.webUrl },
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    try {
      const items = await this.listItems('/root/children');
      return items.map((i) => this.toFile(i));
    } catch (error) {
      this.logger.error('Failed to list drive items', error);
      return [];
    }
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    try {
      return await this.api<Record<string, unknown>>(`/items/${fileId}`);
    } catch {
      return {};
    }
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    try {
      const items = await this.listItems(
        `/root/search(q='${encodeURIComponent(query)}')`,
      );
      return items.map((i) => this.toFile(i));
    } catch (error) {
      this.logger.warn('Graph search failed', error);
      return [];
    }
  }

  private async fetchRawContent(fileId: string): Promise<Buffer> {
    const token = await this.getAccessToken();
    const response = await fetch(
      `${GRAPH_API_BASE}${this.driveBase}/items/${fileId}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      throw new Error(
        `Graph content fetch failed for ${fileId} (HTTP ${response.status})`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `File ${fileId} exceeds the ${MAX_DOWNLOAD_BYTES} byte download limit`,
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

    let items: GraphDriveItem[];
    try {
      items = await this.listItems('/root/children');
    } catch (error) {
      return {
        documentsSynced: 0,
        errors: [{ fileId: 'root', error: (error as Error).message }],
        metadata,
      };
    }
    metadata.filesFound = items.length;

    for (const item of items) {
      try {
        const bytes = await this.fetchRawContent(item.id);
        if (bytes.includes(0)) {
          metadata.skippedBinary = (metadata.skippedBinary as number) + 1;
          continue;
        }
        documents.push({
          id: item.id,
          name: item.name,
          filePath: item.name,
          mimeType: item.file?.mimeType || 'text/plain',
          fileType: item.name.split('.').pop() || 'txt',
          size: bytes.length,
          content: bytes.toString('utf-8'),
          sourceUrl: item.webUrl,
          metadata: {},
        });
      } catch (error) {
        errors.push({ fileId: item.id, error: (error as Error).message });
      }
    }

    return { documentsSynced: documents.length, errors, metadata, documents };
  }
}
