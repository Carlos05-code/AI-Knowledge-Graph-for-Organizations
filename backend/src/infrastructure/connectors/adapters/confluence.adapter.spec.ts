import { ConfluenceAdapter } from './confluence.adapter';

describe('ConfluenceAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new ConfluenceAdapter({
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
      'https://acme.atlassian.net/wiki/rest/api/user/current',
    );
  });

  it('throws when email is missing', async () => {
    await expect(
      new ConfluenceAdapter({ apiToken: 't', domain: 'acme' }).authenticate(),
    ).rejects.toThrow(/email is missing/);
  });

  it('throws when domain/baseUrl is missing', async () => {
    await expect(
      new ConfluenceAdapter({ email: 'a@b.com', apiToken: 't' }).authenticate(),
    ).rejects.toThrow(/site is missing/);
  });

  it('sends HTTP Basic auth built from email + apiToken', async () => {
    fetchSpy.mockResolvedValue(json({ accountId: 'acc-1' }));
    await makeAdapter().authenticate();
    const expected = `Basic ${Buffer.from('user@acme.com:token-123').toString('base64')}`;
    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe(expected);
  });

  it('throws a descriptive error on non-OK responses', async () => {
    fetchSpy.mockResolvedValue(json({}, false, 401));
    await expect(makeAdapter().authenticate()).rejects.toThrow('HTTP 401');
  });

  it('lists pages from CQL search results', async () => {
    fetchSpy.mockResolvedValue(
      json({
        results: [
          {
            id: 'p1',
            type: 'page',
            title: 'Handbook',
            version: { number: 2, when: '2026-01-01T00:00:00.000Z' },
            _links: { webui: '/spaces/ENG/pages/p1' },
          },
        ],
        start: 0,
        limit: 25,
        size: 1,
      }),
    );
    const files = await makeAdapter().listFiles();
    expect(files).toEqual([
      expect.objectContaining({ id: 'p1', name: 'Handbook' }),
    ]);
  });

  it('converts storage-format HTML to markdown-ish text on download', async () => {
    fetchSpy.mockResolvedValue(
      json({
        id: 'p1',
        type: 'page',
        title: 'Handbook',
        body: {
          storage: {
            value:
              '<h1>Title</h1><p>Hello &amp; welcome</p><ul><li>One</li><li>Two</li></ul>',
          },
        },
      }),
    );
    const buffer = await makeAdapter().downloadFile('p1');
    const text = buffer.toString('utf-8');
    expect(text).toContain('# Title');
    expect(text).toContain('Hello & welcome');
    expect(text).toContain('- One');
    expect(text).toContain('- Two');
  });

  it('strips ac:* macro blocks entirely', async () => {
    fetchSpy.mockResolvedValue(
      json({
        id: 'p1',
        body: {
          storage: {
            value:
              '<p>Before</p><ac:structured-macro ac:name="toc"><ac:parameter>x</ac:parameter></ac:structured-macro><p>After</p>',
          },
        },
      }),
    );
    const buffer = await makeAdapter().downloadFile('p1');
    const text = buffer.toString('utf-8');
    expect(text).toContain('Before');
    expect(text).toContain('After');
    expect(text).not.toContain('ac:');
  });

  it('syncs all pages into documents and reports per-page errors', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/content/search')) {
        return Promise.resolve(
          json({
            results: [
              { id: 'p1', title: 'Handbook', _links: {} },
              { id: 'p2', title: 'Runbook', _links: {} },
            ],
            start: 0,
            limit: 25,
            size: 2,
          }),
        );
      }
      if (url.includes('/content/p1')) {
        return Promise.resolve(
          json({
            id: 'p1',
            body: { storage: { value: '<p>Onboarding steps</p>' } },
          }),
        );
      }
      return Promise.resolve(json({}, false, 403));
    });

    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.documents?.[0]).toEqual(
      expect.objectContaining({ id: 'p1', name: 'Handbook.md' }),
    );
  });
});
