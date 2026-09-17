import { JiraAdapter } from './jira.adapter';

describe('JiraAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new JiraAdapter({
      email: 'user@acme.com',
      apiToken: 'token-123',
      domain: 'acme',
      ...overrides,
    });

  const json = (body: Record<string, unknown>, ok = true, status = 200) =>
    ({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }) as Response;

  it('resolves baseUrl from `domain`', async () => {
    fetchSpy.mockResolvedValue(json({ accountId: 'acc-1' }));
    await makeAdapter().authenticate();
    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://acme.atlassian.net/rest/api/3/myself',
    );
  });

  it('prefers an explicit `baseUrl` over `domain`', async () => {
    fetchSpy.mockResolvedValue(json({ accountId: 'acc-1' }));
    await makeAdapter({
      baseUrl: 'https://acme.jira.example.com',
    }).authenticate();
    expect(fetchSpy.mock.calls[0][0]).toBe(
      'https://acme.jira.example.com/rest/api/3/myself',
    );
  });

  it('throws when email is missing', async () => {
    await expect(
      new JiraAdapter({ apiToken: 't', domain: 'acme' }).authenticate(),
    ).rejects.toThrow(/email is missing/);
  });

  it('throws when apiToken is missing', async () => {
    await expect(
      new JiraAdapter({ email: 'a@b.com', domain: 'acme' }).authenticate(),
    ).rejects.toThrow(/API token is missing/);
  });

  it('throws when neither domain nor baseUrl is configured', async () => {
    await expect(
      new JiraAdapter({ email: 'a@b.com', apiToken: 't' }).authenticate(),
    ).rejects.toThrow(/site is missing/);
  });

  it('sends HTTP Basic auth built from email + apiToken', async () => {
    fetchSpy.mockResolvedValue(json({ accountId: 'acc-1' }));
    await makeAdapter().authenticate();
    const expected = `Basic ${Buffer.from('user@acme.com:token-123').toString('base64')}`;
    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe(expected);
  });

  it('throws a descriptive error on non-OK responses', async () => {
    fetchSpy.mockResolvedValue(json({ errorMessages: ['bad'] }, false, 401));
    await expect(makeAdapter().authenticate()).rejects.toThrow('HTTP 401');
  });

  it('lists issues from search results', async () => {
    fetchSpy.mockResolvedValue(
      json({
        issues: [
          {
            id: '1',
            key: 'AKG-1',
            fields: { summary: 'Fix bug', status: { name: 'Open' } },
          },
        ],
        total: 1,
        startAt: 0,
        maxResults: 50,
      }),
    );
    const files = await makeAdapter().listFiles();
    expect(files).toEqual([
      expect.objectContaining({ id: 'AKG-1', name: 'AKG-1: Fix bug' }),
    ]);
  });

  it('renders issue description (ADF) and comments to markdown on download', async () => {
    fetchSpy.mockResolvedValue(
      json({
        id: '1',
        key: 'AKG-1',
        self: 'https://acme.atlassian.net/rest/api/3/issue/1',
        fields: {
          summary: 'Fix bug',
          status: { name: 'Open' },
          issuetype: { name: 'Bug' },
          description: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Something is broken.' }],
              },
            ],
          },
          comment: {
            comments: [
              {
                author: { displayName: 'Jane' },
                created: '2026-01-01',
                body: 'Looking into it',
              },
            ],
          },
        },
      }),
    );

    const buffer = await makeAdapter().downloadFile('AKG-1');
    const text = buffer.toString('utf-8');
    expect(text).toContain('# AKG-1: Fix bug');
    expect(text).toContain('Something is broken.');
    expect(text).toContain('**Jane** (2026-01-01): Looking into it');
  });

  it('syncs issues into documents and reports per-issue errors', async () => {
    fetchSpy.mockResolvedValue(
      json({
        issues: [
          { id: '1', key: 'AKG-1', fields: { summary: 'A', status: {} } },
        ],
        total: 1,
        startAt: 0,
        maxResults: 50,
      }),
    );
    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(1);
    expect(result.documents?.[0]).toEqual(
      expect.objectContaining({ id: 'AKG-1', name: 'AKG-1.md' }),
    );
  });
});
