import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

export class GitHubAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(GitHubAdapter.name);
  private octokit: any = null;

  constructor(config: ConnectorConfig) {
    super(config, 'GITHUB');
  }

  async authenticate(): Promise<void> {
    try {
      const { Octokit } = require('@octokit/rest');
      this.octokit = new Octokit({ auth: this.config.accessToken });
      const { data: user } = await this.octokit.users.getAuthenticated();
      this.logger.log(`GitHub authenticated as ${user.login}`);
    } catch (error) {
      this.logger.error('GitHub authentication failed', error);
      throw error;
    }
  }

  async refreshAccessToken(): Promise<void> {
    // GitHub tokens are typically long-lived
  }

  async listFiles(repo?: string): Promise<ConnectorFile[]> {
    await this.ensureAuth();
    const defaultRepo = this.config.defaultRepo as string | undefined;
    const [owner, repoName] = (repo || defaultRepo || '').split('/');
    if (!owner || !repoName) return [];

    try {
      const { data: contents } = await this.octokit.repos.getContent({
        owner,
        repo: repoName,
        path: '',
      });

      return (Array.isArray(contents) ? contents : [contents]).map(
        (item: any) => ({
          id: item.sha,
          name: item.name,
          mimeType:
            item.type === 'dir'
              ? 'application/vnd.github.directory'
              : 'text/plain',
          size: item.size || 0,
          path: item.path,
          metadata: { type: item.type, htmlUrl: item.html_url },
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to list repo ${repo}`, error);
      return [];
    }
  }

  async downloadFile(_fileId: string): Promise<Buffer> {
    return Promise.resolve(Buffer.from(''));
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    await this.ensureAuth();
    try {
      const { data } = await this.octokit.git.getCommit({
        commit_sha: fileId,
        owner: '',
        repo: '',
      });
      return data;
    } catch {
      return {};
    }
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    await this.ensureAuth();
    try {
      const { data } = await this.octokit.search.code({
        q: query,
        per_page: 20,
      });
      return data.items.map((item: any) => ({
        id: item.sha,
        name: item.name,
        mimeType: 'text/plain',
        size: 0,
        path: item.path,
        metadata: { repo: item.repository?.full_name, htmlUrl: item.html_url },
      }));
    } catch {
      return [];
    }
  }

  syncAll(): Promise<SyncResult> {
    return Promise.resolve({ documentsSynced: 0, errors: [], metadata: {} });
  }

  private async ensureAuth(): Promise<void> {
    if (!this.octokit) await this.authenticate();
  }
}
