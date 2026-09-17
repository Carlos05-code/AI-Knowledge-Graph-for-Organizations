import { LinearAdapter } from './linear.adapter';

describe('LinearAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new LinearAdapter({ apiKey: 'lin_api_key', ...overrides });

  const gql = (data: Record<string, unknown>) =>
    ({ ok: true, json: () => Promise.resolve({ data }) }) as Response;

  const gqlError = (message: string) =>
    ({
      ok: true,
      json: () => Promise.resolve({ errors: [{ message }] }),
    }) as Response;

  it('authenticates and returns the viewer identity', async () => {
    fetchSpy.mockResolvedValue(
      gql({ viewer: { id: 'u1', name: 'AKG Bot', email: 'bot@acme.com' } }),
    );
    const result = await makeAdapter().authenticate();
    expect(result).toEqual({ ok: true, id: 'u1', name: 'AKG Bot' });

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.linear.app/graphql');
    expect(options.headers.Authorization).toBe('lin_api_key');
  });

  it('throws when no API key is configured', async () => {
    await expect(new LinearAdapter({}).authenticate()).rejects.toThrow(
      /API key is missing/,
    );
  });

  it('throws a descriptive error on GraphQL errors', async () => {
    fetchSpy.mockResolvedValue(gqlError('Authentication required'));
    await expect(makeAdapter().authenticate()).rejects.toThrow(
      'Authentication required',
    );
  });

  it('lists issues', async () => {
    fetchSpy.mockResolvedValue(
      gql({
        issues: {
          nodes: [
            {
              id: 'i1',
              identifier: 'AKG-1',
              title: 'Fix bug',
              state: { name: 'Todo' },
            },
          ],
        },
      }),
    );
    const files = await makeAdapter().listFiles();
    expect(files).toEqual([
      expect.objectContaining({ id: 'i1', name: 'AKG-1: Fix bug' }),
    ]);
  });

  it('searches issues by title', async () => {
    fetchSpy.mockResolvedValue(gql({ issues: { nodes: [] } }));
    await makeAdapter().searchFiles('onboarding');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.query).toContain('containsIgnoreCase');
    expect(body.variables).toEqual({ first: 50, query: 'onboarding' });
  });

  it('renders an issue with description and comments on download', async () => {
    fetchSpy.mockResolvedValue(
      gql({
        issue: {
          id: 'i1',
          identifier: 'AKG-1',
          title: 'Fix bug',
          description: 'Something broke',
          state: { name: 'Todo' },
          comments: {
            nodes: [
              {
                body: 'On it',
                createdAt: '2026-01-01',
                user: { name: 'Jane' },
              },
            ],
          },
        },
      }),
    );

    const buffer = await makeAdapter().downloadFile('i1');
    const text = buffer.toString('utf-8');
    expect(text).toContain('# AKG-1: Fix bug');
    expect(text).toContain('Something broke');
    expect(text).toContain('**Jane** (2026-01-01): On it');
  });

  it('syncs issues into documents', async () => {
    fetchSpy.mockResolvedValue(
      gql({
        issues: {
          nodes: [
            {
              id: 'i1',
              identifier: 'AKG-1',
              title: 'Fix bug',
              url: 'https://linear.app/acme/issue/AKG-1',
              state: { name: 'Todo' },
              comments: { nodes: [] },
            },
          ],
        },
      }),
    );
    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(1);
    expect(result.documents?.[0]).toEqual(
      expect.objectContaining({ id: 'i1', name: 'AKG-1.md' }),
    );
  });
});
