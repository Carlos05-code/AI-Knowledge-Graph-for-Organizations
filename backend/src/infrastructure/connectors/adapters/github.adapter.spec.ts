import { GitHubAdapter } from './github.adapter';

const mockOctokit = {
  users: { getAuthenticated: jest.fn() },
  repos: { get: jest.fn(), getContent: jest.fn() },
  git: { getTree: jest.fn() },
  search: { code: jest.fn() },
};

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

describe('GitHubAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new GitHubAdapter({
      token: 'ghp_test',
      defaultRepo: 'acme/knowledge-base',
      ...overrides,
    });

  it('authenticates and returns the login', async () => {
    mockOctokit.users.getAuthenticated.mockResolvedValue({
      data: { login: 'akg-bot' },
    });
    const result = await makeAdapter().authenticate();
    expect(result).toEqual({ ok: true, login: 'akg-bot' });
  });

  it('throws when no token is configured', async () => {
    await expect(
      new GitHubAdapter({ defaultRepo: 'a/b' }).authenticate(),
    ).rejects.toThrow(/token is missing/);
  });

  it('rejects listFiles/syncAll when no repo is configured', async () => {
    mockOctokit.users.getAuthenticated.mockResolvedValue({
      data: { login: 'akg-bot' },
    });
    const adapter = new GitHubAdapter({ token: 't' });
    expect(await adapter.listFiles()).toEqual([]);
    const result = await adapter.syncAll();
    expect(result.documentsSynced).toBe(0);
    expect(result.errors[0].error).toMatch(/repo is missing/);
  });

  it('lists only blob entries from the recursive git tree', async () => {
    mockOctokit.users.getAuthenticated.mockResolvedValue({
      data: { login: 'akg-bot' },
    });
    mockOctokit.repos.get.mockResolvedValue({
      data: { default_branch: 'main' },
    });
    mockOctokit.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { path: 'README.md', type: 'blob', sha: 's1', size: 10 },
          { path: 'src', type: 'tree', sha: 's2' },
        ],
      },
    });

    const files = await makeAdapter().listFiles();
    expect(files).toEqual([
      expect.objectContaining({ id: 'README.md', name: 'README.md' }),
    ]);
    expect(mockOctokit.git.getTree).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'knowledge-base',
        tree_sha: 'main',
        recursive: '1',
      }),
    );
  });

  it('uses the configured branch instead of the default branch when given', async () => {
    mockOctokit.repos.get.mockResolvedValue({
      data: { default_branch: 'main' },
    });
    mockOctokit.git.getTree.mockResolvedValue({ data: { tree: [] } });
    await makeAdapter({ branch: 'develop' }).listFiles();
    expect(mockOctokit.git.getTree).toHaveBeenCalledWith(
      expect.objectContaining({ tree_sha: 'develop' }),
    );
  });

  it('decodes base64 file content on download', async () => {
    mockOctokit.repos.getContent.mockResolvedValue({
      data: {
        type: 'file',
        encoding: 'base64',
        content: Buffer.from('hello world').toString('base64'),
      },
    });
    const buffer = await makeAdapter().downloadFile('README.md');
    expect(buffer.toString('utf-8')).toBe('hello world');
  });

  it('throws when downloading a directory instead of a file', async () => {
    mockOctokit.repos.getContent.mockResolvedValue({ data: [] });
    await expect(makeAdapter().downloadFile('src')).rejects.toThrow(
      /not a downloadable file/,
    );
  });

  it('syncs text files into documents, skipping binaries', async () => {
    mockOctokit.repos.get.mockResolvedValue({
      data: { default_branch: 'main' },
    });
    mockOctokit.git.getTree.mockResolvedValue({
      data: {
        tree: [
          { path: 'README.md', type: 'blob', sha: 's1' },
          { path: 'logo.png', type: 'blob', sha: 's2' },
        ],
      },
    });
    mockOctokit.repos.getContent.mockImplementation(({ path }: any) => {
      if (path === 'README.md') {
        return Promise.resolve({
          data: {
            type: 'file',
            encoding: 'base64',
            content: Buffer.from('# Hello').toString('base64'),
          },
        });
      }
      return Promise.resolve({
        data: {
          type: 'file',
          encoding: 'base64',
          content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]).toString('base64'),
        },
      });
    });

    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(1);
    expect(result.documents?.[0]).toEqual(
      expect.objectContaining({ id: 'README.md', content: '# Hello' }),
    );
    expect(result.metadata.skippedBinary).toBe(1);
  });

  it('reports a sync-level error when the tree cannot be fetched', async () => {
    mockOctokit.repos.get.mockRejectedValue(new Error('repo not found'));
    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(0);
    expect(result.errors[0]).toEqual(
      expect.objectContaining({ fileId: 'tree' }),
    );
  });
});
