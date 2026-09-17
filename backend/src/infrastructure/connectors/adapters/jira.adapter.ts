import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const DEFAULT_ISSUE_LIMIT = 50;
const DEFAULT_JQL = 'ORDER BY updated DESC';

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

interface JiraComment {
  author?: { displayName?: string };
  body?: AdfNode | string;
  created?: string;
}

interface JiraIssue {
  id: string;
  key: string;
  self?: string;
  fields: {
    summary?: string;
    description?: AdfNode | string | null;
    status?: { name?: string };
    issuetype?: { name?: string };
    updated?: string;
    created?: string;
    comment?: { comments?: JiraComment[] };
  };
}

export class JiraAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(JiraAdapter.name);

  constructor(config: ConnectorConfig) {
    super(config, 'JIRA');
  }

  private get email(): string {
    const email = this.config.email as string;
    if (!email) {
      throw new Error('Jira email is missing. Provide `email` in credentials.');
    }
    return email;
  }

  private get apiToken(): string {
    const token = (this.config.apiToken || this.config.accessToken) as string;
    if (!token) {
      throw new Error(
        'Jira API token is missing. Provide `apiToken` in credentials.',
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
        'Jira site is missing. Provide `domain` (e.g. "acme") or `baseUrl` in credentials.',
      );
    }
    return `https://${domain}.atlassian.net`;
  }

  private get jql(): string {
    return (this.config.jql as string) || DEFAULT_JQL;
  }

  private get limit(): number {
    const n = Number(this.config.limit ?? DEFAULT_ISSUE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_ISSUE_LIMIT;
    return Math.min(Math.max(n, 1), 100);
  }

  private get authHeader(): string {
    const encoded = Buffer.from(`${this.email}:${this.apiToken}`).toString(
      'base64',
    );
    return `Basic ${encoded}`;
  }

  private async api<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}/rest/api/3${path}`, {
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.warn(`Jira API ${path} failed: HTTP ${response.status}`);
      throw new Error(
        `Jira API ${path} failed: HTTP ${response.status} ${body.slice(0, 200)}`,
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
      '/myself',
    );
    return { ok: true, accountId: res.accountId, displayName: res.displayName };
  }

  refreshAccessToken(): Promise<void> {
    // API tokens are long-lived; nothing to refresh.
    this.logger.log('JiraAdapter: token refresh no-op (long-lived API token)');
    return Promise.resolve();
  }

  private async searchIssues(jql: string): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let startAt = 0;
    let total = Infinity;

    while (issues.length < this.limit && issues.length < total) {
      const params = new URLSearchParams({
        jql,
        startAt: String(startAt),
        maxResults: String(this.limit),
        fields: 'summary,description,status,issuetype,updated,created,comment',
      });
      const res = await this.api<{
        issues: JiraIssue[];
        total: number;
        startAt: number;
        maxResults: number;
      }>(`/search?${params.toString()}`);
      issues.push(...res.issues);
      total = res.total;
      startAt += res.issues.length;
      if (res.issues.length === 0) break;
    }

    return issues.slice(0, this.limit);
  }

  private toFile(issue: JiraIssue): ConnectorFile {
    return {
      id: issue.key,
      name: `${issue.key}: ${issue.fields.summary || 'Untitled'}`,
      mimeType: 'text/markdown',
      size: 0,
      path: `jira://issue/${issue.key}`,
      createdAt: issue.fields.created
        ? new Date(issue.fields.created)
        : undefined,
      updatedAt: issue.fields.updated
        ? new Date(issue.fields.updated)
        : undefined,
      metadata: { status: issue.fields.status?.name },
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    const issues = await this.searchIssues(this.jql);
    return issues.map((i) => this.toFile(i));
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    return this.api<Record<string, unknown>>(`/issue/${fileId}`);
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    const escaped = query.replace(/"/g, '\\"');
    const issues = await this.searchIssues(
      `text ~ "${escaped}" ORDER BY updated DESC`,
    );
    return issues.map((i) => this.toFile(i));
  }

  private adfToText(node: AdfNode | string | null | undefined): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node.type === 'text') return node.text || '';
    const children = (node.content || []).map((n) => this.adfToText(n));
    if (node.type === 'paragraph' || node.type === 'heading') {
      return children.join('') + '\n';
    }
    if (node.type === 'listItem') {
      return `- ${children.join('')}`;
    }
    return children.join('');
  }

  private renderIssue(issue: JiraIssue): string {
    const { fields } = issue;
    const lines: string[] = [
      `# ${issue.key}: ${fields.summary || 'Untitled'}`,
      `Type: ${fields.issuetype?.name || 'unknown'} | Status: ${fields.status?.name || 'unknown'}`,
    ];

    const description = this.adfToText(fields.description).trim();
    if (description) {
      lines.push('', '## Description', description);
    }

    const comments = fields.comment?.comments || [];
    if (comments.length > 0) {
      lines.push('', '## Comments');
      for (const comment of comments) {
        const author = comment.author?.displayName || 'unknown';
        const body =
          typeof comment.body === 'string'
            ? comment.body
            : this.adfToText(comment.body).trim();
        lines.push(`- **${author}** (${comment.created || ''}): ${body}`);
      }
    }

    return lines.join('\n');
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const issue = await this.api<JiraIssue>(`/issue/${fileId}`);
    return Buffer.from(this.renderIssue(issue), 'utf-8');
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];

    const issues = await this.searchIssues(this.jql);

    for (const issue of issues) {
      try {
        const content = this.renderIssue(issue);
        documents.push({
          id: issue.key,
          name: `${issue.key}.md`,
          filePath: `jira://issue/${issue.key}`,
          mimeType: 'text/markdown',
          fileType: 'md',
          size: Buffer.byteLength(content),
          content,
          sourceUrl: issue.self,
          metadata: {
            status: issue.fields.status?.name,
            issueType: issue.fields.issuetype?.name,
          },
        });
      } catch (error) {
        errors.push({ fileId: issue.key, error: (error as Error).message });
      }
    }

    return {
      documentsSynced: documents.length,
      errors,
      metadata: { issuesFound: issues.length },
      documents,
    };
  }
}
