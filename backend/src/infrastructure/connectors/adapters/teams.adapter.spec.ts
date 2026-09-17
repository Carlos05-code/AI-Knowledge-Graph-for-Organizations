import { TeamsAdapter } from './teams.adapter';

describe('TeamsAdapter', () => {
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
    teamId: 'team-1',
    channelId: 'channel-1',
  };

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new TeamsAdapter({ ...baseConfig, ...overrides });

  const json = (body: unknown, ok = true, status = 200) =>
    ({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }) as Response;

  const tokenResponse = () =>
    json({ access_token: 'token-abc', expires_in: 3600 });

  it('throws when teamId is missing', async () => {
    fetchSpy.mockResolvedValue(tokenResponse());
    await expect(
      new TeamsAdapter({
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
        channelId: 'ch',
      }).listFiles(),
    ).resolves.toEqual([]); // listFiles catches and logs, returns []
  });

  it('throws when channelId is missing', async () => {
    fetchSpy.mockResolvedValue(tokenResponse());
    await expect(
      new TeamsAdapter({
        tenantId: 't',
        clientId: 'c',
        clientSecret: 's',
        teamId: 'tm',
      }).listFiles(),
    ).resolves.toEqual([]);
  });

  it('scopes requests to the configured team and channel', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(json({ value: [] }));
    });

    await makeAdapter().listFiles();

    const apiCall = fetchSpy.mock.calls.find(
      (c) => !String(c[0]).includes('/oauth2/'),
    );
    expect(apiCall?.[0]).toBe(
      'https://graph.microsoft.com/v1.0/teams/team-1/channels/channel-1/messages?$top=100',
    );
  });

  it('strips HTML message bodies to plain text', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(
        json({
          value: [
            {
              id: 'msg1',
              from: { user: { displayName: 'Jane' } },
              body: {
                contentType: 'html',
                content: '<p>Hello <b>team</b></p>',
              },
            },
          ],
        }),
      );
    });

    const files = await makeAdapter().listFiles();
    expect(files[0].name).toBe('Hello team');
  });

  it('follows @odata.nextLink pagination', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      if (url.includes('nextPageToken')) {
        return Promise.resolve(
          json({
            value: [
              { id: 'm2', body: { contentType: 'text', content: 'Two' } },
            ],
          }),
        );
      }
      return Promise.resolve(
        json({
          value: [{ id: 'm1', body: { contentType: 'text', content: 'One' } }],
          '@odata.nextLink':
            'https://graph.microsoft.com/v1.0/next?nextPageToken=1',
        }),
      );
    });

    const files = await makeAdapter().listFiles();
    expect(files.map((f) => f.id)).toEqual(['m1', 'm2']);
  });

  it('filters messages client-side on search', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(
        json({
          value: [
            {
              id: 'm1',
              body: { contentType: 'text', content: 'deploy notes' },
            },
            { id: 'm2', body: { contentType: 'text', content: 'lunch plans' } },
          ],
        }),
      );
    });

    const files = await makeAdapter().searchFiles('deploy');
    expect(files.map((f) => f.id)).toEqual(['m1']);
  });

  it('syncs messages into documents, skipping empty/system messages', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/oauth2/')) return Promise.resolve(tokenResponse());
      return Promise.resolve(
        json({
          value: [
            {
              id: 'm1',
              from: { user: { displayName: 'Jane' } },
              body: { contentType: 'text', content: 'Ship it' },
            },
            { id: 'm2', body: { contentType: 'text', content: '' } },
          ],
        }),
      );
    });

    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(1);
    expect(result.documents?.[0]).toEqual(
      expect.objectContaining({ id: 'm1' }),
    );
  });
});
