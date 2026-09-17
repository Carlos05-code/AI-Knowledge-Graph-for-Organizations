import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const DEFAULT_MESSAGE_LIMIT = 100;

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: GmailHeader[];
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailMessagePart[];
  };
}

function decodeBase64Url(data: string): string {
  return Buffer.from(
    data.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  ).toString('utf-8');
}

function extractPlainText(part: GmailMessagePart | undefined): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part.parts || []) {
    const text = extractPlainText(child);
    if (text) return text;
  }
  return '';
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  return (
    headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ||
    ''
  );
}

export class GmailAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(GmailAdapter.name);
  private oauth2Client: any = null;

  constructor(config: ConnectorConfig) {
    super(config, 'GMAIL');
  }

  private get limit(): number {
    const n = Number(this.config.limit ?? DEFAULT_MESSAGE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_MESSAGE_LIMIT;
    return Math.min(Math.max(n, 1), 500);
  }

  authenticate(): Promise<void> {
    const { google } = require('googleapis');
    this.oauth2Client = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri,
    );
    this.oauth2Client.setCredentials({
      access_token: this.config.accessToken,
      refresh_token: this.config.refreshToken,
    });
    this.logger.log('Gmail authenticated');
    return Promise.resolve();
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.oauth2Client) await this.authenticate();
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.config.accessToken = credentials.access_token;
      this.config.refreshToken =
        credentials.refresh_token || this.config.refreshToken;
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      throw error;
    }
  }

  private async ensureAuth(): Promise<void> {
    if (!this.oauth2Client) await this.authenticate();
  }

  private gmail(): any {
    const { google } = require('googleapis');
    return google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  private async listMessageIds(query?: string): Promise<string[]> {
    await this.ensureAuth();
    const ids: string[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.gmail().users.messages.list({
        userId: 'me',
        maxResults: Math.min(this.limit - ids.length, 500),
        q: query,
        pageToken,
      });
      ids.push(...(response.data.messages || []).map((m: any) => m.id));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken && ids.length < this.limit);

    return ids.slice(0, this.limit);
  }

  private async getMessage(
    id: string,
    format: 'metadata' | 'full' = 'metadata',
  ): Promise<GmailMessage> {
    await this.ensureAuth();
    const response = await this.gmail().users.messages.get({
      userId: 'me',
      id,
      format,
      metadataHeaders:
        format === 'metadata' ? ['Subject', 'From', 'Date'] : undefined,
    });
    return response.data;
  }

  private toFile(message: GmailMessage): ConnectorFile {
    const headers = message.payload?.headers;
    return {
      id: message.id,
      name: headerValue(headers, 'Subject') || '(no subject)',
      mimeType: 'text/plain',
      size: 0,
      path: `gmail://message/${message.id}`,
      updatedAt: message.internalDate
        ? new Date(Number(message.internalDate))
        : undefined,
      metadata: { from: headerValue(headers, 'From') },
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    try {
      const ids = await this.listMessageIds();
      const messages = await Promise.all(ids.map((id) => this.getMessage(id)));
      return messages.map((m) => this.toFile(m));
    } catch (error) {
      this.logger.error('Failed to list messages', error);
      return [];
    }
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    try {
      return (await this.getMessage(fileId, 'full')) as unknown as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    try {
      const ids = await this.listMessageIds(query);
      const messages = await Promise.all(ids.map((id) => this.getMessage(id)));
      return messages.map((m) => this.toFile(m));
    } catch (error) {
      this.logger.warn('Gmail search failed', error);
      return [];
    }
  }

  private renderMessage(message: GmailMessage): string {
    const headers = message.payload?.headers;
    const subject = headerValue(headers, 'Subject') || '(no subject)';
    const from = headerValue(headers, 'From') || 'unknown';
    const date = headerValue(headers, 'Date') || 'unknown';
    const body = extractPlainText(message.payload) || message.snippet || '';
    return [`# ${subject}`, `From: ${from}`, `Date: ${date}`, '', body].join(
      '\n',
    );
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const message = await this.getMessage(fileId, 'full');
    return Buffer.from(this.renderMessage(message), 'utf-8');
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];

    let ids: string[];
    try {
      ids = await this.listMessageIds();
    } catch (error) {
      return {
        documentsSynced: 0,
        errors: [{ fileId: 'messages', error: (error as Error).message }],
        metadata: {},
      };
    }

    for (const id of ids) {
      try {
        const message = await this.getMessage(id, 'full');
        const content = this.renderMessage(message);
        const headers = message.payload?.headers;
        documents.push({
          id: message.id,
          name: `${headerValue(headers, 'Subject') || message.id}.md`,
          filePath: `gmail://message/${message.id}`,
          mimeType: 'text/markdown',
          fileType: 'md',
          size: Buffer.byteLength(content),
          content,
          metadata: { from: headerValue(headers, 'From') },
        });
      } catch (error) {
        errors.push({ fileId: id, error: (error as Error).message });
      }
    }

    return {
      documentsSynced: documents.length,
      errors,
      metadata: { messagesFound: ids.length },
      documents,
    };
  }
}
