import { NotionAdapter } from './notion.adapter';

describe('NotionAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new NotionAdapter({ token: 'ntn_test_token', ...overrides });

  const json = (body: Record<string, unknown>, ok = true, status = 200) =>
    ({ ok, status, json: () => Promise.resolve(body) }) as Response;

  it('authenticates and returns bot identity', async () => {
    fetchSpy.mockResolvedValue(json({ id: 'bot-1', name: 'AKG Bot' }));
    const result = await makeAdapter().authenticate();
    expect(result).toEqual({ ok: true, botId: 'bot-1', name: 'AKG Bot' });
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain('/users/me');
    expect((options.headers as Record<string, string>)['Notion-Version']).toBe(
      '2022-06-28',
    );
  });

  it('throws when no token is configured', async () => {
    await expect(new NotionAdapter({}).authenticate()).rejects.toThrow(
      /token is missing/,
    );
  });

  it('throws a descriptive error on Notion API error responses', async () => {
    fetchSpy.mockResolvedValue(
      json({ object: 'error', message: 'Invalid token' }, false, 401),
    );
    await expect(makeAdapter().authenticate()).rejects.toThrow('Invalid token');
  });

  it('lists pages from search results', async () => {
    fetchSpy.mockResolvedValue(
      json({
        results: [
          {
            id: 'page-1',
            object: 'page',
            url: 'https://notion.so/page-1',
            last_edited_time: '2026-01-01T00:00:00.000Z',
            properties: {
              Name: { type: 'title', title: [{ plain_text: 'Handbook' }] },
            },
          },
        ],
        has_more: false,
        next_cursor: null,
      }),
    );

    const files = await makeAdapter().listFiles();
    expect(files).toEqual([
      expect.objectContaining({ id: 'page-1', name: 'Handbook' }),
    ]);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain('/search');
    expect(options.method).toBe('POST');
  });

  it('falls back to an "Untitled" name when no title property is present', async () => {
    fetchSpy.mockResolvedValue(
      json({
        results: [{ id: 'page-2', object: 'page', properties: {} }],
        has_more: false,
        next_cursor: null,
      }),
    );
    const files = await makeAdapter().listFiles();
    expect(files[0].name).toBe('Untitled (page-2)');
  });

  it('renders page blocks to markdown when downloading', async () => {
    fetchSpy.mockResolvedValue(
      json({
        results: [
          {
            id: 'block-1',
            type: 'heading_1',
            has_children: false,
            heading_1: { rich_text: [{ plain_text: 'Title' }] },
          },
          {
            id: 'block-2',
            type: 'paragraph',
            has_children: false,
            paragraph: { rich_text: [{ plain_text: 'Body text' }] },
          },
        ],
        has_more: false,
        next_cursor: null,
      }),
    );

    const buffer = await makeAdapter().downloadFile('page-1');
    expect(buffer.toString('utf-8')).toBe('# Title\n\nBody text');
  });

  it('syncs all pages into documents with rendered content', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/search')) {
        return Promise.resolve(
          json({
            results: [
              {
                id: 'page-1',
                object: 'page',
                url: 'https://notion.so/page-1',
                last_edited_time: '2026-01-01T00:00:00.000Z',
                properties: {
                  Name: { type: 'title', title: [{ plain_text: 'Handbook' }] },
                },
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
        );
      }
      return Promise.resolve(
        json({
          results: [
            {
              id: 'b1',
              type: 'paragraph',
              has_children: false,
              paragraph: { rich_text: [{ plain_text: 'Onboarding steps' }] },
            },
          ],
          has_more: false,
          next_cursor: null,
        }),
      );
    });

    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.documents?.[0]).toEqual(
      expect.objectContaining({
        id: 'page-1',
        name: 'Handbook.md',
        content: 'Onboarding steps',
      }),
    );
  });

  it('collects per-page errors during sync without aborting the whole run', async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url.includes('/search')) {
        return Promise.resolve(
          json({
            results: [
              { id: 'page-1', object: 'page', properties: {} },
              { id: 'page-2', object: 'page', properties: {} },
            ],
            has_more: false,
            next_cursor: null,
          }),
        );
      }
      return Promise.resolve(
        json({ object: 'error', message: 'blocked' }, false, 403),
      );
    });

    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(0);
    expect(result.errors).toHaveLength(2);
  });
});
