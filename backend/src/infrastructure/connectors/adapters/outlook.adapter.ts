import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';
import { MicrosoftGraphAuth } from './microsoft-graph-auth';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
const DEFAULT_MESSAGE_LIMIT = 100;

interface GraphMailAddress {
  emailAddress?: { name?: string; address?: string };
}

interface GraphMessage {
  id: string;
  subject?: string;
  from?: GraphMailAddress;
  receivedDateTime?: string;
  bodyPreview?: string;
  webLink?: string;
  body?: { contentType?: string; content?: string };
}

interface GraphMessagePage {
  value: GraphMessage[];
  '@odata.nextLink'?: string;
}

/**
 * Outlook mail via Microsoft Graph. App-only auth has no signed-in "me",
 * so a target mailbox must be given explicitly via `userId`.
 */
export class OutlookAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(OutlookAdapter.name);
  private readonly auth: MicrosoftGraphAuth;

  constructor(config: ConnectorConfig) {
    super(config, 'OUTLOOK');
    this.auth = new MicrosoftGraphAuth(config);
  }

  private get userId(): string {
    const userId = this.config.userId as string;
    if (!userId) {
      throw new Error(
        'Outlook mailbox is missing. Provide `userId` in credentials.',
      );
    }
    return userId;
  }

  private get limit(): number {
    const n = Number(this.config.limit ?? DEFAULT_MESSAGE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_MESSAGE_LIMIT;
    return Math.min(Math.max(n, 1), 500);
  }

  async authenticate(): Promise<{ ok: boolean }> {
    await this.auth.getAccessToken(true);
    return { ok: true };
  }

  async refreshAccessToken(): Promise<void> {
    await this.auth.getAccessToken(true);
  }

  /** Requests plain-text bodies instead of Graph's default HTML, so no HTML-to-text pass is needed. */
  private async api<T>(
    path: string,
    options: { absoluteUrl?: string; search?: boolean } = {},
  ): Promise<T> {
    const token = await this.auth.getAccessToken();
    const url =
      options.absoluteUrl || `${GRAPH_API_BASE}/users/${this.userId}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.body-content-type="text"',
    };
    if (options.search) headers['ConsistencyLevel'] = 'eventual';

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.warn(`Graph API ${path} failed: HTTP ${response.status}`);
      throw new Error(
        `Graph API ${path} failed: HTTP ${response.status} ${body.slice(0, 200)}`,
      );
    }
    return (await response.json()) as T;
  }

  private async listMessages(query?: string): Promise<GraphMessage[]> {
    const messages: GraphMessage[] = [];
    const params = new URLSearchParams({ $top: String(this.limit) });
    if (query) params.set('$search', `"${query}"`);

    let page = await this.api<GraphMessagePage>(
      `/messages?${params.toString()}`,
      { search: Boolean(query) },
    );
    messages.push(...page.value);

    while (page['@odata.nextLink'] && messages.length < this.limit) {
      page = await this.api<GraphMessagePage>('', {
        absoluteUrl: page['@odata.nextLink'],
        search: Boolean(query),
      });
      messages.push(...page.value);
    }

    return messages.slice(0, this.limit);
  }

  private toFile(message: GraphMessage): ConnectorFile {
    return {
      id: message.id,
      name: message.subject || '(no subject)',
      mimeType: 'text/plain',
      size: 0,
      path: `outlook://message/${message.id}`,
      updatedAt: message.receivedDateTime
        ? new Date(message.receivedDateTime)
        : undefined,
      metadata: {
        from: message.from?.emailAddress?.address,
        webLink: message.webLink,
      },
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    try {
      const messages = await this.listMessages();
      return messages.map((m) => this.toFile(m));
    } catch (error) {
      this.logger.error('Failed to list messages', error);
      return [];
    }
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    try {
      return await this.api<Record<string, unknown>>(`/messages/${fileId}`);
    } catch {
      return {};
    }
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    try {
      const messages = await this.listMessages(query);
      return messages.map((m) => this.toFile(m));
    } catch (error) {
      this.logger.warn('Graph mail search failed', error);
      return [];
    }
  }

  private renderMessage(message: GraphMessage): string {
    const from = message.from?.emailAddress?.address || 'unknown';
    const lines = [
      `# ${message.subject || '(no subject)'}`,
      `From: ${from}`,
      `Date: ${message.receivedDateTime || 'unknown'}`,
      '',
      message.body?.content || message.bodyPreview || '',
    ];
    return lines.join('\n');
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const message = await this.api<GraphMessage>(`/messages/${fileId}`);
    return Buffer.from(this.renderMessage(message), 'utf-8');
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];

    let messages: GraphMessage[];
    try {
      messages = await this.listMessages();
    } catch (error) {
      return {
        documentsSynced: 0,
        errors: [{ fileId: 'messages', error: (error as Error).message }],
        metadata: {},
      };
    }

    for (const message of messages) {
      try {
        const detail = await this.api<GraphMessage>(`/messages/${message.id}`);
        const content = this.renderMessage(detail);
        documents.push({
          id: message.id,
          name: `${message.subject || message.id}.md`,
          filePath: `outlook://message/${message.id}`,
          mimeType: 'text/markdown',
          fileType: 'md',
          size: Buffer.byteLength(content),
          content,
          sourceUrl: message.webLink,
          metadata: { from: message.from?.emailAddress?.address },
        });
      } catch (error) {
        errors.push({ fileId: message.id, error: (error as Error).message });
      }
    }

    return {
      documentsSynced: documents.length,
      errors,
      metadata: { messagesFound: messages.length },
      documents,
    };
  }
}
