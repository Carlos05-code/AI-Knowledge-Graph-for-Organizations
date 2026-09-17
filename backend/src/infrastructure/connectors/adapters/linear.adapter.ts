import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const DEFAULT_ISSUE_LIMIT = 50;

interface LinearComment {
  body: string;
  createdAt: string;
  user?: { name?: string } | null;
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  state?: { name?: string } | null;
  comments?: { nodes: LinearComment[] };
}

export class LinearAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(LinearAdapter.name);

  constructor(config: ConnectorConfig) {
    super(config, 'LINEAR');
  }

  private get apiKey(): string {
    const key = (this.config.apiKey || this.config.accessToken) as string;
    if (!key) {
      throw new Error(
        'Linear API key is missing. Provide `apiKey` in credentials.',
      );
    }
    return key;
  }

  private get limit(): number {
    const n = Number(this.config.limit ?? DEFAULT_ISSUE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_ISSUE_LIMIT;
    return Math.min(Math.max(n, 1), 100);
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const json = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (!response.ok || json.errors?.length) {
      const message =
        json.errors?.map((e) => e.message).join('; ') ||
        `HTTP ${response.status}`;
      this.logger.warn(`Linear API request failed: ${message}`);
      throw new Error(`Linear API request failed: ${message}`);
    }
    return json.data as T;
  }

  async authenticate(): Promise<{ ok: boolean; id?: string; name?: string }> {
    const data = await this.graphql<{
      viewer: { id: string; name: string; email: string };
    }>('query { viewer { id name email } }');
    return { ok: true, id: data.viewer.id, name: data.viewer.name };
  }

  refreshAccessToken(): Promise<void> {
    // Personal API keys don't expire; OAuth apps negotiate refresh elsewhere.
    this.logger.log('LinearAdapter: token refresh no-op (long-lived API key)');
    return Promise.resolve();
  }

  private readonly issueFields = `
    id identifier title description url createdAt updatedAt
    state { name }
    comments { nodes { body createdAt user { name } } }
  `;

  private async fetchIssues(filter?: string): Promise<LinearIssue[]> {
    const data = await this.graphql<{
      issues: { nodes: LinearIssue[] };
    }>(
      `query Issues($first: Int!${filter ? ', $query: String!' : ''}) {
        issues(first: $first, orderBy: updatedAt${
          filter ? `, filter: { title: { containsIgnoreCase: $query } }` : ''
        }) {
          nodes { ${this.issueFields} }
        }
      }`,
      filter ? { first: this.limit, query: filter } : { first: this.limit },
    );
    return data.issues.nodes;
  }

  private toFile(issue: LinearIssue): ConnectorFile {
    return {
      id: issue.id,
      name: `${issue.identifier}: ${issue.title}`,
      mimeType: 'text/markdown',
      size: 0,
      path: `linear://issue/${issue.id}`,
      createdAt: issue.createdAt ? new Date(issue.createdAt) : undefined,
      updatedAt: issue.updatedAt ? new Date(issue.updatedAt) : undefined,
      metadata: { state: issue.state?.name },
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    const issues = await this.fetchIssues();
    return issues.map((i) => this.toFile(i));
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    const data = await this.graphql<{ issue: LinearIssue }>(
      `query Issue($id: String!) { issue(id: $id) { ${this.issueFields} } }`,
      { id: fileId },
    );
    return data.issue as unknown as Record<string, unknown>;
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    const issues = await this.fetchIssues(query);
    return issues.map((i) => this.toFile(i));
  }

  private renderIssue(issue: LinearIssue): string {
    const lines = [
      `# ${issue.identifier}: ${issue.title}`,
      `Status: ${issue.state?.name || 'unknown'}`,
    ];

    if (issue.description) {
      lines.push('', '## Description', issue.description);
    }

    const comments = issue.comments?.nodes || [];
    if (comments.length > 0) {
      lines.push('', '## Comments');
      for (const comment of comments) {
        lines.push(
          `- **${comment.user?.name || 'unknown'}** (${comment.createdAt}): ${comment.body}`,
        );
      }
    }

    return lines.join('\n');
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const issue = (await this.getFileMetadata(
      fileId,
    )) as unknown as LinearIssue;
    return Buffer.from(this.renderIssue(issue), 'utf-8');
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];

    const issues = await this.fetchIssues();

    for (const issue of issues) {
      try {
        const content = this.renderIssue(issue);
        documents.push({
          id: issue.id,
          name: `${issue.identifier}.md`,
          filePath: `linear://issue/${issue.id}`,
          mimeType: 'text/markdown',
          fileType: 'md',
          size: Buffer.byteLength(content),
          content,
          sourceUrl: issue.url,
          metadata: { state: issue.state?.name },
        });
      } catch (error) {
        errors.push({ fileId: issue.id, error: (error as Error).message });
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
