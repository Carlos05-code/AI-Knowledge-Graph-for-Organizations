import { GitLabAdapter } from './gitlab.adapter';

describe('GitLabAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new GitLabAdapter({
      token: 'glpat-test',
      defaultProject: 'acme/knowledge-base',
      ...overrides,
    });

  const json = (body: unknown, ok = true, status = 200) =>
    ({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }) as Response;

  const bytes = (buf: Buffer) =>
    ({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(
          buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        ),
    }) as Response;

  it('authenticates against the GitLab API with PRIVATE-TOKEN', async () => {
    fetchSpy.mockResolvedValue(json({ id: 1, username: 'akg-bot' }));
    const result = await makeAdapter().authenticate();
    expect(result).toEqual({ ok: true, id: 1, username: 'akg-bot' });
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://gitlab.com/api/v4/user');
    expect(options.headers['PRIVATE-TOKEN']).toBe('glpat-test');
  });

  it('respects a self-hosted `baseUrl`', async () => {
    fetchSpy.mockResolvedValue(json({ id: 1, username: 'akg-bot' }));
    await makeAdapter({
      baseUrl: 'https://gitlab.acme.internal',
    }).authenticate();
    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://gitlab.acme.internal/api/v4/user',
    );
  });

  it('throws when no token is configured', async () => {
    await expect(
      new GitLabAdapter({ defaultProject: 'a/b' }).authenticate(),
    ).rejects.toThrow(/token is missing/);
  });

  it('throws when neither projectId nor defaultProject is configured', async () => {
    fetchSpy.mockResolvedValue(json({ id: 1 }));
    await expect(new GitLabAdapter({ token: 't' }).listFiles()).rejects.toThrow(
      /project is missing/,
    );
  });

  it('URL-encodes the project path in API requests', async () => {
    fetchSpy.mockResolvedValue(json([]));
    await makeAdapter().listFiles();
    expect(fetchSpy.mock.calls[0][0]).toContain(
      `/projects/${encodeURIComponent('acme/knowledge-base')}/repository/tree`,
    );
  });

  it('lists only blob entries from the repository tree, not subtrees', async () => {
    fetchSpy.mockResolvedValue(
      json([
        { id: 'b1', name: 'README.md', type: 'blob', path: 'README.md' },
        { id: 't1', name: 'src', type: 'tree', path: 'src' },
      ]),
    );
    const files = await makeAdapter().listFiles();
    expect(files).toEqual([
      expect.objectContaining({ id: 'README.md', name: 'README.md' }),
    ]);
  });

  it('filters files client-side by path substring on search', async () => {
    fetchSpy.mockResolvedValue(
      json([
        { id: 'b1', name: 'README.md', type: 'blob', path: 'README.md' },
        {
          id: 'b2',
          name: 'onboarding.md',
          type: 'blob',
          path: 'docs/onboarding.md',
        },
      ]),
    );
    const files = await makeAdapter().searchFiles('onboarding');
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('onboarding.md');
  });

  it('downloads raw file content', async () => {
    fetchSpy.mockResolvedValue(bytes(Buffer.from('hello world')));
    const buffer = await makeAdapter().downloadFile('README.md');
    expect(buffer.toString('utf-8')).toBe('hello world');
    expect(fetchSpy.mock.calls[0][0]).toContain('/raw?');
  });

  it('syncs text files into documents, skipping binaries', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/repository/tree')) {
        return Promise.resolve(
          json([
            { id: 'b1', name: 'README.md', type: 'blob', path: 'README.md' },
            { id: 'b2', name: 'logo.png', type: 'blob', path: 'logo.png' },
          ]),
        );
      }
      if (url.includes('README.md/raw')) {
        return Promise.resolve(bytes(Buffer.from('# Hello')));
      }
      return Promise.resolve(bytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0])));
    });

    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(1);
    expect(result.documents?.[0]).toEqual(
      expect.objectContaining({ id: 'README.md', content: '# Hello' }),
    );
    expect(result.metadata.skippedBinary).toBe(1);
  });
});
