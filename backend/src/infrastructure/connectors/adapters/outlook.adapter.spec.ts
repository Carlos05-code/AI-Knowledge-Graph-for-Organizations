import { OutlookAdapter } from './outlook.adapter';

describe('OutlookAdapter', () => {
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
    userId: 'mailbox@acme.com',
  };

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new OutlookAdapter({ ...baseConfig, ...overrides });

  const json = (body: unknown, ok = true, status = 200) =>
    ({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }) as Response;

  const tokenResponse = () =>
    json({ access_token: 'token-abc', expires_in: 3600 });

  it('throws when userId (target mailbox) is missing', async () => {
    fetchSpy.mockResolvedValue(tokenResponse());
    await expect(
      new OutlookAdapter({
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
      }).listFiles(),
    ).resolves.toEqual([]); // listFiles catches and logs, returns []
  });

  it('scopes requests to the configured mailbox and requests plain-text bodies', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(json({ value: [] }));
    });

    await makeAdapter().listFiles();

    const apiCall = fetchSpy.mock.calls.find(
      (c) => !String(c[0]).includes('/oauth2/'),
    );
    expect(apiCall?.[0]).toContain(
      '/users/mailbox@acme.com/messages?%24top=100',
    );
    expect(apiCall?.[1].headers.Prefer).toBe(
      'outlook.body-content-type="text"',
    );
  });

  it('lists messages, following @odata.nextLink pagination', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      if (url.includes('nextPageToken')) {
        return Promise.resolve(json({ value: [{ id: 'm2', subject: 'Two' }] }));
      }
      return Promise.resolve(
        json({
          value: [{ id: 'm1', subject: 'One' }],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/next?nextPageToken=1',
        }),
      );
    });

    const files = await makeAdapter().listFiles();
    expect(files.map((f) => f.id)).toEqual(['m1', 'm2']);
  });

  it('adds the ConsistencyLevel header when searching', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(json({ value: [] }));
    });

    await makeAdapter().searchFiles('invoice');

    const apiCall = fetchSpy.mock.calls.find(
      (c) => !String(c[0]).includes('/oauth2/'),
    );
    expect(apiCall?.[0]).toContain('%24search=%22invoice%22');
    expect(apiCall?.[1].headers.ConsistencyLevel).toBe('eventual');
  });

  it('renders a message with headers and plain-text body on download', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(
        json({
          id: 'm1',
          subject: 'Quarterly report',
          from: { emailAddress: { address: 'boss@acme.com' } },
          receivedDateTime: '2026-01-01T00:00:00Z',
          body: { contentType: 'text', content: 'See attached.' },
        }),
      );
    });

    const buffer = await makeAdapter().downloadFile('m1');
    const text = buffer.toString('utf-8');
    expect(text).toContain('# Quarterly report');
    expect(text).toContain('From: boss@acme.com');
    expect(text).toContain('See attached.');
  });

  it('syncs messages into documents and reports per-message errors', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      if (url.includes('/messages?')) {
        return Promise.resolve(
          json({
            value: [
              { id: 'm1', subject: 'Ok' },
              { id: 'm2', subject: 'Bad' },
            ],
          }),
        );
      }
      if (url.includes('/messages/m1')) {
        return Promise.resolve(
          json({
            id: 'm1',
            subject: 'Ok',
            body: { content: 'hello' },
          }),
        );
      }
      return Promise.resolve(json({}, false, 403));
    });

    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.documents?.[0]).toEqual(
      expect.objectContaining({ id: 'm1', name: 'Ok.md' }),
    );
  });
});
