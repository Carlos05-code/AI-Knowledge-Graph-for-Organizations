import { DropboxAdapter } from './dropbox.adapter';

describe('DropboxAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
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

  describe('with a long-lived accessToken', () => {
    const makeAdapter = (overrides: Record<string, unknown> = {}) =>
      new DropboxAdapter({ accessToken: 'dbx-token', ...overrides });

    it('authenticates against get_current_account', async () => {
      fetchSpy.mockResolvedValue(
        json({ account_id: 'acc-1', name: { display_name: 'AKG Bot' } }),
      );
      const result = await makeAdapter().authenticate();
      expect(result).toEqual({ ok: true, accountId: 'acc-1', name: 'AKG Bot' });

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe(
        'https://api.dropboxapi.com/2/users/get_current_account',
      );
      expect(options.headers.Authorization).toBe('Bearer dbx-token');
    });

    it('throws when no token is configured at all', async () => {
      await expect(new DropboxAdapter({}).authenticate()).rejects.toThrow(
        /token is missing/,
      );
    });

    it('lists only file entries from a recursive list_folder', async () => {
      fetchSpy.mockResolvedValue(
        json({
          entries: [
            { '.tag': 'file', id: 'id:1', name: 'a.txt', path_lower: '/a.txt' },
            { '.tag': 'folder', name: 'Docs', path_lower: '/docs' },
          ],
          has_more: false,
          cursor: 'c1',
        }),
      );
      const files = await makeAdapter().listFiles();
      expect(files).toEqual([
        expect.objectContaining({ id: 'id:1', name: 'a.txt' }),
      ]);
    });

    it('follows has_more pagination via list_folder/continue', async () => {
      fetchSpy.mockImplementation((url: string) => {
        if (url.includes('/list_folder/continue')) {
          return Promise.resolve(
            json({
              entries: [
                {
                  '.tag': 'file',
                  id: 'id:2',
                  name: 'b.txt',
                  path_lower: '/b.txt',
                },
              ],
              has_more: false,
              cursor: 'c2',
            }),
          );
        }
        return Promise.resolve(
          json({
            entries: [
              {
                '.tag': 'file',
                id: 'id:1',
                name: 'a.txt',
                path_lower: '/a.txt',
              },
            ],
            has_more: true,
            cursor: 'c1',
          }),
        );
      });

      const files = await makeAdapter().listFiles();
      expect(files.map((f) => f.id)).toEqual(['id:1', 'id:2']);
    });

    it('downloads raw file content via the content API with Dropbox-API-Arg', async () => {
      fetchSpy.mockResolvedValue(bytes(Buffer.from('hello world')));
      const buffer = await makeAdapter().downloadFile('/a.txt');
      expect(buffer.toString('utf-8')).toBe('hello world');

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://content.dropboxapi.com/2/files/download');
      expect(JSON.parse(options.headers['Dropbox-API-Arg'])).toEqual({
        path: '/a.txt',
      });
    });

    it('filters search_v2 matches down to file entries', async () => {
      fetchSpy.mockResolvedValue(
        json({
          matches: [
            {
              metadata: {
                metadata: {
                  '.tag': 'file',
                  id: 'id:1',
                  name: 'invoice.txt',
                  path_lower: '/invoice.txt',
                },
              },
            },
            {
              metadata: {
                metadata: { '.tag': 'folder', name: 'Invoices' },
              },
            },
          ],
        }),
      );
      const files = await makeAdapter().searchFiles('invoice');
      expect(files).toEqual([
        expect.objectContaining({ id: 'id:1', name: 'invoice.txt' }),
      ]);
    });

    it('syncs text files into documents, skipping binaries', async () => {
      fetchSpy.mockImplementation((url: string, options?: any) => {
        if (url.includes('/list_folder')) {
          return Promise.resolve(
            json({
              entries: [
                {
                  '.tag': 'file',
                  id: 'id:1',
                  name: 'a.txt',
                  path_lower: '/a.txt',
                },
                {
                  '.tag': 'file',
                  id: 'id:2',
                  name: 'logo.png',
                  path_lower: '/logo.png',
                },
              ],
              has_more: false,
              cursor: 'c1',
            }),
          );
        }
        if (url.includes('/files/download')) {
          const arg = JSON.parse(options.headers['Dropbox-API-Arg']);
          if (arg.path === '/a.txt')
            return Promise.resolve(bytes(Buffer.from('# Hello')));
          return Promise.resolve(
            bytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0])),
          );
        }
        return Promise.resolve(json({}, false, 400));
      });

      const result = await makeAdapter().syncAll();
      expect(result.documentsSynced).toBe(1);
      expect(result.documents?.[0]).toEqual(
        expect.objectContaining({ id: 'id:1', content: '# Hello' }),
      );
      expect(result.metadata.skippedBinary).toBe(1);
    });
  });

  describe('with a refreshToken', () => {
    const makeAdapter = (overrides: Record<string, unknown> = {}) =>
      new DropboxAdapter({
        refreshToken: 'refresh-1',
        clientId: 'app-key',
        clientSecret: 'app-secret',
        ...overrides,
      });

    it('exchanges the refresh token for an access token via the token endpoint', async () => {
      fetchSpy.mockImplementation((url: string) => {
        if (url.includes('/oauth2/token')) {
          return Promise.resolve(
            json({ access_token: 'fresh-token', expires_in: 14400 }),
          );
        }
        return Promise.resolve(json({ account_id: 'acc-1' }));
      });

      await makeAdapter().authenticate();

      const tokenCall = fetchSpy.mock.calls.find((c) =>
        String(c[0]).includes('/oauth2/token'),
      );
      const body = new URLSearchParams(tokenCall?.[1].body);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('refresh-1');
      expect(body.get('client_id')).toBe('app-key');
    });

    it('throws when clientId/clientSecret are missing for a refresh flow', async () => {
      await expect(
        new DropboxAdapter({ refreshToken: 'r' }).authenticate(),
      ).rejects.toThrow(/app key\/secret is missing/);
    });

    it('caches the token across calls within its expiry window', async () => {
      fetchSpy.mockImplementation((url: string) => {
        if (url.includes('/oauth2/token')) {
          return Promise.resolve(
            json({ access_token: 'fresh-token', expires_in: 14400 }),
          );
        }
        return Promise.resolve(
          json({ entries: [], has_more: false, cursor: 'c' }),
        );
      });

      const adapter = makeAdapter();
      await adapter.listFiles();
      await adapter.listFiles();

      const tokenCalls = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).includes('/oauth2/token'),
      );
      expect(tokenCalls).toHaveLength(1);
    });
  });
});
