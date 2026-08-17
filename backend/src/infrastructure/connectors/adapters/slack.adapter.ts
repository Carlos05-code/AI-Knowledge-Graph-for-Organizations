import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const SLACK_API_BASE = 'https://slack.com/api';
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_FILE_LIMIT = 25;

interface SlackApiFile {
  id: string;
  name?: string;
  title?: string;
  filetype?: string;
  mimetype?: string;
  size?: number;
  url_private?: string;
  url?: string;
  channels?: string[];
  created?: number;
  timestamp?: number;
}

interface SlackMessage {
  ts: string;
  user?: string;
  text?: string;
  subtype?: string;
  files?: SlackApiFile[];
}

export class SlackAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(SlackAdapter.name);

  constructor(config: ConnectorConfig) {
    super(config, 'SLACK');
  }

  private get token(): string {
    const token = (this.config.accessToken || this.config.token) as string;
    if (!token) {
      throw new Error(
        'Slack token is missing. Provide `token` or `accessToken` in credentials.',
      );
    }
    return token;
  }

  private get baseUrl(): string {
    return ((this.config.baseUrl as string) || SLACK_API_BASE).replace(
      /\/$/,
      '',
    );
  }

  private get limit(): number {
    const n = Number(this.config.limit ?? DEFAULT_FILE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_FILE_LIMIT;
    return Math.min(Math.max(n, 1), 200);
  }

  private get channelIds(): string[] {
    const single = this.config.channelId as string | undefined;
    const many = this.config.channels as string[] | undefined;
    const list = Array.isArray(many) ? many.filter(Boolean) : [];
    if (single) list.unshift(single);
    return Array.from(new Set(list));
  }

  private async api<T extends { ok: boolean; error?: string }>(
    path: string,
    params: Record<string, string | number | boolean | null | undefined> = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const json = (await response.json()) as T;
    if (!json.ok) {
      const message = json.error || 'unknown error';
      this.logger.warn(`Slack API ${path} failed: ${message}`);
      throw new Error(`Slack API ${path} failed: ${message}`);
    }
    return json;
  }

  async authenticate(): Promise<{
    ok: boolean;
    teamId?: string;
    botId?: string;
    appId?: string;
  }> {
    const res = await this.api<{
      ok: boolean;
      team_id?: string;
      bot_id?: string;
      app_id?: string;
    }>('auth.test');
    return {
      ok: true,
      teamId: res.team_id,
      botId: res.bot_id,
      appId: res.app_id,
    };
  }

  refreshAccessToken(): Promise<void> {
    // Slack bot tokens are long-lived; refresh only applies to OAuth apps
    // that negotiate token exchange elsewhere. No-op by design.
    this.logger.log('SlackAdapter: token refresh no-op (long-lived bot token)');
    return Promise.resolve();
  }

  async listFiles(channelId?: string): Promise<ConnectorFile[]> {
    const params: Record<string, string | number | boolean | null | undefined> =
      {
        limit: this.limit,
        types: 'files',
      };
    if (channelId) params.channel = channelId;
    const res = await this.api<{ ok: boolean; files?: SlackApiFile[] }>(
      'files.list',
      params,
    );
    return (res.files || []).map((f) => this.toFile(f));
  }

  private toFile(f: SlackApiFile): ConnectorFile {
    return {
      id: f.id,
      name: f.name || f.title || `slack-file-${f.id}`,
      mimeType: f.mimetype || f.filetype || 'application/octet-stream',
      size: typeof f.size === 'number' ? f.size : 0,
      path: `slack://file/${f.id}`,
      createdAt: f.created ? new Date(f.created * 1000) : undefined,
      updatedAt: f.timestamp ? new Date(f.timestamp * 1000) : undefined,
      metadata: {
        filetype: f.filetype,
        title: f.title,
        downloadUrl: f.url_private || f.url,
        channel: f.channels,
      },
    };
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const files = await this.listFiles();
    const file = files.find((f) => f.id === fileId);
    if (!file) throw new Error(`Slack file not found: ${fileId}`);
    return this.fetchBytes(file);
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    const res = await this.api<{
      ok: boolean;
      file?: SlackApiFile;
    }>('files.info', { file: fileId });
    return (res.file || {}) as unknown as Record<string, unknown>;
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    const res = await this.api<{ ok: boolean; files?: SlackApiFile[] }>(
      'search.files',
      { query, count: this.limit },
    );
    return (res.files || []).map((f) => this.toFile(f));
  }

  private async fetchBytes(file: ConnectorFile): Promise<Buffer> {
    const url = (file.metadata?.downloadUrl || file.metadata?.url) as
      string | undefined;
    if (!url) throw new Error(`No download URL available for ${file.id}`);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) {
      throw new Error(
        `Slack download failed for ${file.id} (HTTP ${response.status})`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `File ${file.id} exceeds the ${MAX_DOWNLOAD_BYTES} byte download limit`,
      );
    }
    return bytes;
  }

  private async listChannels(): Promise<Array<{ id: string; name: string }>> {
    const res = await this.api<{
      ok: boolean;
      channels?: Array<{ id: string; name: string }>;
    }>('conversations.list', {
      limit: this.limit,
      types: 'public_channel,private_channel',
    });
    return res.channels || [];
  }

  private async exportChannel(channelId: string): Promise<ConnectorDocument> {
    const res = await this.api<{
      ok: boolean;
      channels?: Array<{ id: string; name: string }>;
      messages?: SlackMessage[];
    }>('conversations.history', {
      channel: channelId,
      limit: this.limit,
    });

    let channelName = channelId;
    try {
      const channels = await this.listChannels();
      channelName = channels.find((c) => c.id === channelId)?.name || channelId;
    } catch {
      // name lookup is best-effort; fall back to the channel id
    }

    const lines = (res.messages || [])
      .filter((m) => m.text && !m.subtype)
      .map((m) => {
        const user = m.user ? `<@${m.user}>` : 'unknown';
        const ts = m.ts ? new Date(Number(m.ts) * 1000).toISOString() : '';
        return `# ${user} (${ts})\n${m.text}`;
      });

    const content = lines.length
      ? `# Slack channel export: #${channelName}\n\n${lines.join('\n\n')}\n`
      : `# Slack channel export: #${channelName}\n\n(no messages found)\n`;

    return {
      id: `channel_${channelId}`,
      name: `slack-${channelName}.md`,
      filePath: `slack://channel/${channelId}`,
      mimeType: 'text/markdown',
      fileType: 'md',
      size: Buffer.byteLength(content),
      content,
      metadata: { channelId, channelName },
    };
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];
    const metadata: Record<string, unknown> = {
      channels: 0,
      files: 0,
      skippedBinary: 0,
    };

    for (const channelId of this.channelIds) {
      try {
        documents.push(await this.exportChannel(channelId));
        metadata.channels = (metadata.channels as number) + 1;
      } catch (error) {
        errors.push({
          fileId: `channel:${channelId}`,
          error: (error as Error).message,
        });
      }
    }

    let files: ConnectorFile[] = [];
    try {
      files = await this.listFiles();
      metadata.filesFound = files.length;
    } catch (error) {
      errors.push({ fileId: 'files.list', error: (error as Error).message });
    }

    for (const file of files.slice(0, this.limit)) {
      try {
        const bytes = await this.fetchBytes(file);
        if (bytes.includes(0)) {
          metadata.skippedBinary = (metadata.skippedBinary as number) + 1;
          continue;
        }
        documents.push({
          id: file.id,
          name: file.name,
          filePath: file.path,
          mimeType: file.mimeType,
          fileType: (file.metadata?.filetype as string) || 'txt',
          size: file.size || bytes.length,
          content: bytes.toString('utf-8'),
          sourceUrl: (file.metadata?.downloadUrl as string) || undefined,
          metadata: { channel: file.metadata?.channel },
        });
        metadata.files = (metadata.files as number) + 1;
      } catch (error) {
        errors.push({ fileId: file.id, error: (error as Error).message });
      }
    }

    return { documentsSynced: documents.length, errors, metadata, documents };
  }
}
