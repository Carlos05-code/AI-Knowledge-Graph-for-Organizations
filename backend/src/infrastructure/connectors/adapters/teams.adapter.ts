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

interface GraphChatMessage {
  id: string;
  createdDateTime?: string;
  from?: { user?: { displayName?: string } };
  body?: { contentType?: string; content?: string };
  webUrl?: string;
}

interface GraphChatMessagePage {
  value: GraphChatMessage[];
  '@odata.nextLink'?: string;
}

/** Strips Teams' HTML message bodies down to plain text — no `Prefer: text` equivalent exists for chatMessage. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Microsoft Teams channel messages via Graph. App-only auth requires
 * both the team and the specific channel to sync (no signed-in "me").
 */
export class TeamsAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(TeamsAdapter.name);
  private readonly auth: MicrosoftGraphAuth;

  constructor(config: ConnectorConfig) {
    super(config, 'TEAMS');
    this.auth = new MicrosoftGraphAuth(config);
  }

  private get teamId(): string {
    const teamId = this.config.teamId as string;
    if (!teamId) {
      throw new Error(
        'Teams team is missing. Provide `teamId` in credentials.',
      );
    }
    return teamId;
  }

  private get channelId(): string {
    const channelId = this.config.channelId as string;
    if (!channelId) {
      throw new Error(
        'Teams channel is missing. Provide `channelId` in credentials.',
      );
    }
    return channelId;
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

  private async api<T>(path: string, absoluteUrl?: string): Promise<T> {
    const token = await this.auth.getAccessToken();
    const url =
      absoluteUrl ||
      `${GRAPH_API_BASE}/teams/${this.teamId}/channels/${this.channelId}${path}`;
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

  private async listMessages(): Promise<GraphChatMessage[]> {
    const messages: GraphChatMessage[] = [];
    let page = await this.api<GraphChatMessagePage>(
      `/messages?$top=${this.limit}`,
    );
    messages.push(...page.value);

    while (page['@odata.nextLink'] && messages.length < this.limit) {
      page = await this.api<GraphChatMessagePage>('', page['@odata.nextLink']);
      messages.push(...page.value);
    }

    return messages.slice(0, this.limit);
  }

  private renderedBody(message: GraphChatMessage): string {
    const raw = message.body?.content || '';
    return message.body?.contentType === 'html' ? stripHtml(raw) : raw.trim();
  }

  private toFile(message: GraphChatMessage): ConnectorFile {
    const text = this.renderedBody(message);
    return {
      id: message.id,
      name: text.slice(0, 60) || `Message ${message.id}`,
      mimeType: 'text/plain',
      size: 0,
      path: `teams://message/${message.id}`,
      createdAt: message.createdDateTime
        ? new Date(message.createdDateTime)
        : undefined,
      metadata: {
        from: message.from?.user?.displayName,
        webUrl: message.webUrl,
      },
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    try {
      const messages = await this.listMessages();
      return messages.map((m) => this.toFile(m));
    } catch (error) {
      this.logger.error('Failed to list channel messages', error);
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

  /** Graph has no query endpoint for channel messages, so search filters client-side over the listed page. */
  async searchFiles(query: string): Promise<ConnectorFile[]> {
    try {
      const messages = await this.listMessages();
      const needle = query.toLowerCase();
      return messages
        .filter((m) => this.renderedBody(m).toLowerCase().includes(needle))
        .map((m) => this.toFile(m));
    } catch (error) {
      this.logger.warn('Teams search failed', error);
      return [];
    }
  }

  private renderMessage(message: GraphChatMessage): string {
    const from = message.from?.user?.displayName || 'unknown';
    const date = message.createdDateTime || 'unknown';
    return [
      `From: ${from}`,
      `Date: ${date}`,
      '',
      this.renderedBody(message),
    ].join('\n');
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const message = await this.api<GraphChatMessage>(`/messages/${fileId}`);
    return Buffer.from(this.renderMessage(message), 'utf-8');
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];

    let messages: GraphChatMessage[];
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
        const content = this.renderMessage(message);
        if (!this.renderedBody(message)) continue; // skip empty/system messages

        documents.push({
          id: message.id,
          name: `teams-message-${message.id}.md`,
          filePath: `teams://message/${message.id}`,
          mimeType: 'text/markdown',
          fileType: 'md',
          size: Buffer.byteLength(content),
          content,
          sourceUrl: message.webUrl,
          metadata: { from: message.from?.user?.displayName },
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
