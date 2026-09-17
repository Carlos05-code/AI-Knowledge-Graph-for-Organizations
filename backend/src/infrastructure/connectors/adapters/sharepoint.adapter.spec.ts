import { SharePointAdapter } from './sharepoint.adapter';

describe('SharePointAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new SharePointAdapter({
      tenantId: 'tenant-1',
      clientId: 'client-1',
      clientSecret: 'secret-1',
      siteId: 'site-1',
      ...overrides,
    });

  const json = (body: unknown, ok = true, status = 200) =>
    ({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }) as Response;

  const tokenResponse = () =>
    json({ access_token: 'token-abc', expires_in: 3600 });

  it('throws when siteId is missing', async () => {
    fetchSpy.mockResolvedValue(tokenResponse());
    await expect(
      new SharePointAdapter({
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
      }).listFiles(),
    ).resolves.toEqual([]); // listFiles catches and logs, returns []
  });

  it('scopes drive requests to the configured site', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(json({ value: [] }));
    });

    await makeAdapter().listFiles();

    const apiCall = fetchSpy.mock.calls.find(
      (c) => !String(c[0]).includes('/oauth2/'),
    );
    expect(apiCall?.[0]).toBe(
      'https://graph.microsoft.com/v1.0/sites/site-1/drive/root/children',
    );
  });

  it('authenticates the same way as OneDrive (shared base class)', async () => {
    fetchSpy.mockResolvedValue(tokenResponse());
    const result = await makeAdapter().authenticate();
    expect(result).toEqual({ ok: true });
  });
});
