import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const DEFAULT_FILE_LIMIT = 100;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;

interface GitHubTreeItem {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

export class GitHubAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(GitHubAdapter.name);
  private octokit: any = null;

  constructor(config: ConnectorConfig) {
    super(config, 'GITHUB');
  }

  private get token(): string {
    const token = (this.config.accessToken || this.config.token) as string;
    if (!token) {
      throw new Error(
        'GitHub token is missing. Provide `token` or `accessToken` in credentials.',
      );
    }
    return token;
  }

  private get repoSlug(): { owner: string; repo: string } {
    const slug =
      (this.config.defaultRepo as string) || (this.config.repo as string) || '';
    const [owner, repo] = slug.split('/');
    if (!owner || !repo) {
      throw new Error(
        'GitHub repo is missing. Provide `defaultRepo` (e.g. "acme/knowledge-base") in credentials.',
      );
    }
    return { owner, repo };
  }

  private get limit(): number {
    const n = Number(this.config.limit ?? DEFAULT_FILE_LIMIT);
    if (!Number.isFinite(n)) return DEFAULT_FILE_LIMIT;
    return Math.min(Math.max(n, 1), 500);
  }

  private async ensureAuth(): Promise<void> {
    if (!this.octokit) await this.authenticate();
  }

  async authenticate(): Promise<{ ok: boolean; login?: string }> {
    try {
      const { Octokit } = require('@octokit/rest');
      this.octokit = new Octokit({ auth: this.token });
      const { data: user } = await this.octokit.users.getAuthenticated();
      this.logger.log(`GitHub authenticated as ${user.login}`);
      return { ok: true, login: user.login };
    } catch (error) {
      this.logger.error('GitHub authentication failed', error);
      throw error;
    }
  }

  refreshAccessToken(): Promise<void> {
    // GitHub personal/app tokens are long-lived; nothing to refresh.
    this.logger.log('GitHubAdapter: token refresh no-op (long-lived token)');
    return Promise.resolve();
  }

  private async listTree(): Promise<GitHubTreeItem[]> {
    await this.ensureAuth();
    const { owner, repo } = this.repoSlug;

    const { data: repoInfo } = await this.octokit.repos.get({ owner, repo });
    const branch = (this.config.branch as string) || repoInfo.default_branch;

    const { data: treeData } = await this.octokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: '1',
    });

    return (treeData.tree as GitHubTreeItem[])
      .filter((item) => item.type === 'blob')
      .slice(0, this.limit);
  }

  private toFile(item: GitHubTreeItem): ConnectorFile {
    return {
      id: item.path,
      name: item.path.split('/').pop() || item.path,
      mimeType: 'text/plain',
      size: item.size || 0,
      path: item.path,
      metadata: { sha: item.sha },
    };
  }

  async listFiles(): Promise<ConnectorFile[]> {
    try {
      const items = await this.listTree();
      return items.map((i) => this.toFile(i));
    } catch (error) {
      this.logger.error('Failed to list repo tree', error);
      return [];
    }
  }

  private async fetchRawContent(filePath: string): Promise<Buffer> {
    await this.ensureAuth();
    const { owner, repo } = this.repoSlug;
    const branch = this.config.branch as string | undefined;

    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });

    if (Array.isArray(data) || data.type !== 'file' || !data.content) {
      throw new Error(`${filePath} is not a downloadable file`);
    }

    const bytes = Buffer.from(data.content, data.encoding || 'base64');
    if (bytes.length > MAX_DOWNLOAD_BYTES) {
      throw new Error(
        `File ${filePath} exceeds the ${MAX_DOWNLOAD_BYTES} byte download limit`,
      );
    }
    return bytes;
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    return this.fetchRawContent(fileId);
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    await this.ensureAuth();
    const { owner, repo } = this.repoSlug;
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path: fileId,
      });
      return data as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    await this.ensureAuth();
    const { owner, repo } = this.repoSlug;
    try {
      const { data } = await this.octokit.search.code({
        q: `${query} repo:${owner}/${repo}`,
        per_page: this.limit,
      });
      return data.items.map((item: any) => ({
        id: item.path,
        name: item.name,
        mimeType: 'text/plain',
        size: 0,
        path: item.path,
        metadata: {
          repo: item.repository?.full_name,
          htmlUrl: item.html_url,
        },
      }));
    } catch (error) {
      this.logger.warn('GitHub code search failed', error);
      return [];
    }
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];
    const metadata: Record<string, unknown> = { skippedBinary: 0 };

    let items: GitHubTreeItem[];
    try {
      items = await this.listTree();
    } catch (error) {
      return {
        documentsSynced: 0,
        errors: [{ fileId: 'tree', error: (error as Error).message }],
        metadata,
      };
    }
    metadata.filesFound = items.length;

    for (const item of items) {
      try {
        const bytes = await this.fetchRawContent(item.path);
        if (bytes.includes(0)) {
          metadata.skippedBinary = (metadata.skippedBinary as number) + 1;
          continue;
        }
        documents.push({
          id: item.path,
          name: item.path.split('/').pop() || item.path,
          filePath: item.path,
          mimeType: 'text/plain',
          fileType: item.path.split('.').pop() || 'txt',
          size: bytes.length,
          content: bytes.toString('utf-8'),
          metadata: { sha: item.sha },
        });
      } catch (error) {
        errors.push({ fileId: item.path, error: (error as Error).message });
      }
    }

    return { documentsSynced: documents.length, errors, metadata, documents };
  }
}
