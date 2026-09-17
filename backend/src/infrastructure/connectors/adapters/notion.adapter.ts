import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DEFAULT_PAGE_LIMIT = 25;
const MAX_BLOCK_DEPTH = 2;

interface NotionRichText {
  plain_text?: string;
}

interface NotionPropertyValue {
  type: string;
  title?: NotionRichText[];
}

interface NotionPage {
  id: string;
  object: 'page' | 'database';
  url?: string;
  created_time?: string;
  last_edited_time?: string;
  properties?: Record<string, NotionPropertyValue>;
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

export class NotionAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(NotionAdapter.name);

  constructor(config: ConnectorConfig) {
    super(config, 'NOTION');
  }

  private get token(): string {
    const token = (this.config.accessToken || this.config.token) as string;
    if (!token) {
      throw new Error(
        'Notion token is missing. Provide `token` or `accessToken` in credentials.',
      );
    }
    return token;
  }

  private get pageLimit(): number {
    const n = Number(this.config.limit ?? DEFAULT_PAGE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_PAGE_LIMIT;
    return Math.min(Math.max(n, 1), 100);
  }

  private async api<T>(
    path: string,
    options: { method?: string; body?: Record<string, unknown> } = {},
  ): Promise<T> {
    const response = await fetch(`${NOTION_API_BASE}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const json = (await response.json()) as T & {
      object?: string;
      message?: string;
    };
    if (!response.ok || json.object === 'error') {
      const message = json.message || `HTTP ${response.status}`;
      this.logger.warn(`Notion API ${path} failed: ${message}`);
      throw new Error(`Notion API ${path} failed: ${message}`);
    }
    return json;
  }

  async authenticate(): Promise<{
    ok: boolean;
    botId?: string;
    name?: string;
  }> {
    const res = await this.api<{
      id: string;
      name?: string;
      bot?: unknown;
    }>('/users/me');
    return { ok: true, botId: res.id, name: res.name };
  }

  refreshAccessToken(): Promise<void> {
    // Notion internal integration secrets are long-lived; public OAuth
    // integrations negotiate refresh elsewhere. No-op by design.
    this.logger.log(
      'NotionAdapter: token refresh no-op (long-lived integration secret)',
    );
    return Promise.resolve();
  }

  private async searchPages(query?: string): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;

    do {
      const res = await this.api<{
        results: NotionPage[];
        has_more: boolean;
        next_cursor: string | null;
      }>('/search', {
        method: 'POST',
        body: {
          query: query || undefined,
          filter: { value: 'page', property: 'object' },
          page_size: this.pageLimit,
          start_cursor: cursor,
        },
      });
      pages.push(...res.results);
      cursor = res.has_more ? res.next_cursor || undefined : undefined;
    } while (cursor && pages.length < this.pageLimit);

    return pages.slice(0, this.pageLimit);
  }

  private titleOf(page: NotionPage): string {
    const titleProp = Object.values(page.properties || {}).find(
      (p) => p.type === 'title',
    );
    const text = (titleProp?.title || [])
      .map((t) => t.plain_text || '')
      .join('');
    return text || `Untitled (${page.id})`;
  }

  private toFile(page: NotionPage): ConnectorFile {
    return {
      id: page.id,
      name: this.titleOf(page),
      mimeType: 'text/markdown',
      size: 0,
      path: `notion://page/${page.id}`,
      createdAt: page.created_time ? new Date(page.created_time) : undefined,
      updatedAt: page.last_edited_time
        ? new Date(page.last_edited_time)
        : undefined,
      metadata: { url: page.url },
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    const pages = await this.searchPages();
    return pages.map((p) => this.toFile(p));
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    return this.api<Record<string, unknown>>(`/pages/${fileId}`);
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    const pages = await this.searchPages(query);
    return pages.map((p) => this.toFile(p));
  }

  private blockToText(block: NotionBlock): string {
    const body = block[block.type] as
      { rich_text?: NotionRichText[] } | undefined;
    const text = (body?.rich_text || [])
      .map((t) => t.plain_text || '')
      .join('');
    if (!text) return '';

    switch (block.type) {
      case 'heading_1':
        return `# ${text}`;
      case 'heading_2':
        return `## ${text}`;
      case 'heading_3':
        return `### ${text}`;
      case 'bulleted_list_item':
        return `- ${text}`;
      case 'numbered_list_item':
        return `1. ${text}`;
      case 'to_do':
        return `- [ ] ${text}`;
      case 'quote':
        return `> ${text}`;
      case 'code':
        return `\`\`\`\n${text}\n\`\`\``;
      default:
        return text;
    }
  }

  private async renderPage(pageId: string, depth = 0): Promise<string> {
    if (depth > MAX_BLOCK_DEPTH) return '';

    const lines: string[] = [];
    let cursor: string | undefined;
    let fetched = 0;
    const MAX_BLOCKS_PER_PAGE = 200;

    do {
      const res = await this.api<{
        results: NotionBlock[];
        has_more: boolean;
        next_cursor: string | null;
      }>(
        `/blocks/${pageId}/children?page_size=100${
          cursor ? `&start_cursor=${cursor}` : ''
        }`,
      );

      for (const block of res.results) {
        const text = this.blockToText(block);
        if (text) lines.push(text);
        if (block.has_children && depth < MAX_BLOCK_DEPTH) {
          const nested = await this.renderPage(block.id, depth + 1);
          if (nested) lines.push(nested);
        }
      }

      fetched += res.results.length;
      cursor = res.has_more ? res.next_cursor || undefined : undefined;
    } while (cursor && fetched < MAX_BLOCKS_PER_PAGE);

    return lines.join('\n\n');
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const content = await this.renderPage(fileId);
    return Buffer.from(content, 'utf-8');
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];

    const pages = await this.searchPages();

    for (const page of pages) {
      try {
        const title = this.titleOf(page);
        const content = await this.renderPage(page.id);
        const body = content || `# ${title}\n\n(no content extracted)\n`;
        documents.push({
          id: page.id,
          name: `${title}.md`,
          filePath: `notion://page/${page.id}`,
          mimeType: 'text/markdown',
          fileType: 'md',
          size: Buffer.byteLength(body),
          content: body,
          sourceUrl: page.url,
          metadata: {
            lastEditedTime: page.last_edited_time,
          },
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
