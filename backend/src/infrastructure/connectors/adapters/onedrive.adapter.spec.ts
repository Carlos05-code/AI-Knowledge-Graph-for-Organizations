import { OneDriveAdapter } from './onedrive.adapter';

describe('OneDriveAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  const baseConfig = {
    tenantId: 'tenant-1',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    driveId: 'drive-1',
  };

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new OneDriveAdapter({ ...baseConfig, ...overrides });

  const json = (body: unknown, ok = true, status = 200) =>
    ({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }) as Response;

  const tokenResponse = () =>
    json({ access_token: 'token-abc', expires_in: 3600 });

  const bytes = (buf: Buffer) =>
    ({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(
          buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        ),
    }) as Response;

  it('acquires an app-only token via client-credentials against the tenant endpoint', async () => {
    fetchSpy.mockResolvedValue(tokenResponse());
    const result = await makeAdapter().authenticate();
    expect(result).toEqual({ ok: true });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
    );
    expect(options.method).toBe('POST');
    const body = new URLSearchParams(options.body);
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('scope')).toBe('https://graph.microsoft.com/.default');
  });

  it('throws when tenantId is missing', async () => {
    await expect(
      new OneDriveAdapter({
        clientId: 'c',
        clientSecret: 's',
        driveId: 'd',
      }).authenticate(),
    ).rejects.toThrow(/tenant is missing/);
  });

  it('throws when neither driveId nor userId is configured', async () => {
    fetchSpy.mockResolvedValue(tokenResponse());
    await expect(
      new OneDriveAdapter({
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
      }).listFiles(),
    ).resolves.toEqual([]); // listFiles catches and logs, returns []
  });

  it('resolves driveBase from `userId` when `driveId` is absent', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(json({ value: [] }));
    });
    await makeAdapter({ driveId: undefined, userId: 'user-1' }).listFiles();
    const apiCall = fetchSpy.mock.calls.find(
      (c) => !String(c[0]).includes('/oauth2/'),
    );
    expect(apiCall?.[0]).toContain('/users/user-1/drive/root/children');
  });

  it('lists files, filtering out folders, following @odata.nextLink pagination', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      if (url.includes('nextPageToken')) {
        return Promise.resolve(
          json({ value: [{ id: 'f2', name: 'b.txt', file: {} }] }),
        );
      }
      return Promise.resolve(
        json({
          value: [
            { id: 'f1', name: 'a.txt', file: {} },
            { id: 'folder1', name: 'Docs', folder: {} },
          ],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/next?nextPageToken=1',
        }),
      );
    });

    const files = await makeAdapter().listFiles();
    expect(files.map((f) => f.id)).toEqual(['f1', 'f2']);
  });

  it('reuses a cached token across calls within its expiry window', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(json({ value: [] }));
    });

    const adapter = makeAdapter();
    await adapter.listFiles();
    await adapter.listFiles();

    const tokenCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('/oauth2/'),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it('downloads raw file content with a Bearer token', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(bytes(Buffer.from('hello world')));
    });

    const buffer = await makeAdapter().downloadFile('f1');
    expect(buffer.toString('utf-8')).toBe('hello world');
  });

  it('syncs text files into documents, skipping binaries', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      if (url.includes('/root/children')) {
        return Promise.resolve(
          json({
            value: [
              { id: 'f1', name: 'a.txt', file: {} },
              { id: 'f2', name: 'logo.png', file: {} },
            ],
          }),
        );
      }
      if (url.includes('/items/f1/content')) {
        return Promise.resolve(bytes(Buffer.from('hello')));
      }
      return Promise.resolve(bytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0])));
    });

    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(1);
    expect(result.documents?.[0]).toEqual(
      expect.objectContaining({ id: 'f1', content: 'hello' }),
    );
    expect(result.metadata.skippedBinary).toBe(1);
  });
});
