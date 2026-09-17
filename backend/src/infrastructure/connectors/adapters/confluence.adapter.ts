import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const DEFAULT_PAGE_LIMIT = 25;

interface ConfluenceContent {
  id: string;
  type: string;
  title: string;
  version?: { number?: number; when?: string };
  body?: { storage?: { value?: string } };
  _links?: { webui?: string; base?: string };
}

interface ConfluenceSearchResult {
  results: ConfluenceContent[];
  start: number;
  limit: number;
  size: number;
}

export class ConfluenceAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(ConfluenceAdapter.name);

  constructor(config: ConnectorConfig) {
    super(config, 'CONFLUENCE');
  }

  private get email(): string {
    const email = this.config.email as string;
    if (!email) {
      throw new Error(
        'Confluence email is missing. Provide `email` in credentials.',
      );
    }
    return email;
  }

  private get apiToken(): string {
    const token = (this.config.apiToken || this.config.accessToken) as string;
    if (!token) {
      throw new Error(
        'Confluence API token is missing. Provide `apiToken` in credentials.',
      );
    }
    return token;
  }

  private get baseUrl(): string {
    const explicit = this.config.baseUrl as string | undefined;
    if (explicit) return explicit.replace(/\/$/, '');
    const domain = this.config.domain as string | undefined;
    if (!domain) {
      throw new Error(
        'Confluence site is missing. Provide `domain` (e.g. "acme") or `baseUrl` in credentials.',
      );
    }
    return `https://${domain}.atlassian.net/wiki`;
  }

  private get limit(): number {
    const n = Number(this.config.limit ?? DEFAULT_PAGE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_PAGE_LIMIT;
    return Math.min(Math.max(n, 1), 100);
  }

  private get authHeader(): string {
    const encoded = Buffer.from(`${this.email}:${this.apiToken}`).toString(
      'base64',
    );
    return `Basic ${encoded}`;
  }

  private async api<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}/rest/api${path}`, {
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.warn(
        `Confluence API ${path} failed: HTTP ${response.status}`,
      );
      throw new Error(
        `Confluence API ${path} failed: HTTP ${response.status} ${body.slice(0, 200)}`,
      );
    }
    return (await response.json()) as T;
  }

  async authenticate(): Promise<{
    ok: boolean;
    accountId?: string;
    displayName?: string;
  }> {
    const res = await this.api<{ accountId: string; displayName?: string }>(
      '/user/current',
    );
    return { ok: true, accountId: res.accountId, displayName: res.displayName };
  }

  refreshAccessToken(): Promise<void> {
    // API tokens are long-lived; nothing to refresh.
    this.logger.log(
      'ConfluenceAdapter: token refresh no-op (long-lived API token)',
    );
    return Promise.resolve();
  }

  private async searchContent(cql: string): Promise<ConfluenceContent[]> {
    const results: ConfluenceContent[] = [];
    let start = 0;

    while (results.length < this.limit) {
      const params = new URLSearchParams({
        cql,
        start: String(start),
        limit: String(this.limit),
        expand: 'version',
      });
      const res = await this.api<ConfluenceSearchResult>(
        `/content/search?${params.toString()}`,
      );
      results.push(...res.results);
      start += res.results.length;
      if (res.results.length < res.limit) break; // last page — fewer than requested
      if (res.results.length === 0) break;
    }

    return results.slice(0, this.limit);
  }

  private toFile(content: ConfluenceContent): ConnectorFile {
    return {
      id: content.id,
      name: content.title,
      mimeType: 'text/markdown',
      size: 0,
      path: `confluence://page/${content.id}`,
      updatedAt: content.version?.when
        ? new Date(content.version.when)
        : undefined,
      metadata: { webui: content._links?.webui },
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    const pages = await this.searchContent(
      'type=page order by lastmodified desc',
    );
    return pages.map((p) => this.toFile(p));
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    return this.api<Record<string, unknown>>(
      `/content/${fileId}?expand=body.storage,version`,
    );
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    const escaped = query.replace(/"/g, '\\"');
    const pages = await this.searchContent(
      `type=page and text ~ "${escaped}" order by lastmodified desc`,
    );
    return pages.map((p) => this.toFile(p));
  }

  /** Confluence storage format is XHTML-ish; strip tags/macros to readable markdown-ish text. */
  private storageToText(html: string): string {
    return html
      .replace(/<ac:[\s\S]*?<\/ac:[^>]+>/g, '') // drop macro blocks entirely
      .replace(
        /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
        (_m, level, inner) =>
          `${'#'.repeat(Number(level))} ${this.stripTags(inner)}\n`,
      )
      .replace(
        /<li[^>]*>([\s\S]*?)<\/li>/gi,
        (_m, inner) => `- ${this.stripTags(inner)}\n`,
      )
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .split(/\n{3,}/)
      .join('\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  private stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, '').trim();
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const content = await this.api<ConfluenceContent>(
      `/content/${fileId}?expand=body.storage`,
    );
    const text = this.storageToText(content.body?.storage?.value || '');
    return Buffer.from(text, 'utf-8');
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];

    const pages = await this.searchContent(
      'type=page order by lastmodified desc',
    );

    for (const page of pages) {
      try {
        const detail = await this.api<ConfluenceContent>(
          `/content/${page.id}?expand=body.storage`,
        );
        const text = this.storageToText(detail.body?.storage?.value || '');
        const body = text || `# ${page.title}\n\n(no content extracted)\n`;
        documents.push({
          id: page.id,
          name: `${page.title}.md`,
          filePath: `confluence://page/${page.id}`,
          mimeType: 'text/markdown',
          fileType: 'md',
          size: Buffer.byteLength(body),
          content: body,
          sourceUrl: page._links?.webui
            ? `${this.baseUrl}${page._links.webui}`
            : undefined,
          metadata: { version: page.version?.number },
        });
      } catch (error) {
        errors.push({ fileId: page.id, error: (error as Error).message });
      }
    }

    return {
      documentsSynced: documents.length,
      errors,
      metadata: { pagesFound: pages.length },
      documents,
    };
  }
}
