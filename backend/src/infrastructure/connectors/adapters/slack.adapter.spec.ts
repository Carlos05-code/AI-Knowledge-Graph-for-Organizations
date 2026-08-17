import { SlackAdapter } from './slack.adapter';

describe('SlackAdapter', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new SlackAdapter({ token: 'xoxb-test-token', ...overrides });

  const apiJson = (body: Record<string, unknown>) =>
    ({ ok: true, json: () => Promise.resolve(body) }) as Response;

  const apiBytes = (body: Buffer) =>
    ({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(
          body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        ),
    }) as Response;

  it('authenticates and returns identity', async () => {
    fetchSpy.mockResolvedValue(
      apiJson({ ok: true, team_id: 'T1', bot_id: 'B1', app_id: 'APP' }),
    );
    const result = await makeAdapter().authenticate();
    expect(result).toEqual({
      ok: true,
      teamId: 'T1',
      botId: 'B1',
      appId: 'APP',
    });
    expect(fetchSpy.mock.calls[0][0]).toContain('auth.test');
  });

  it('throws descriptive error on invalid credentials', async () => {
    fetchSpy.mockResolvedValue(apiJson({ ok: false, error: 'invalid_auth' }));
    await expect(makeAdapter().authenticate()).rejects.toThrow('invalid_auth');
  });

  it('throws when no token is configured', async () => {
    fetchSpy.mockResolvedValue(apiJson({ ok: true, team_id: 'T1' }));
    await expect(new SlackAdapter({}).authenticate()).rejects.toThrow(
      /token is missing/,
    );
  });

  it('maps listFiles results', async () => {
    fetchSpy.mockResolvedValue(
      apiJson({
        ok: true,
        files: [
          {
            id: 'F1',
            name: 'release.md',
            title: 'Release notes',
            filetype: 'text',
            mimetype: 'text/markdown',
            size: 20,
            url_private: 'https://files.slack.com/f1',
            created: 1700000000,
          },
        ],
      }),
    );
    const files = await makeAdapter().listFiles();
    expect(files).toHaveLength(1);
    expect(files[0].path).toContain('slack://file');
  });

  it('downloads text files and skips binary in syncAll', async () => {
    fetchSpy.mockImplementation((url: unknown) => {
      const target = String(url);
      if (target.includes('files.list')) {
        return apiJson({
          ok: true,
          files: [
            {
              id: 'FTXT',
              name: 'notes.txt',
              filetype: 'text',
              mimetype: 'text/plain',
              size: 31,
              url_private: 'https://files.slack.com/ftxt',
            },
            {
              id: 'FPNG',
              name: 'shot.png',
              filetype: 'png',
              mimetype: 'image/png',
              size: 40,
              url_private: 'https://files.slack.com/fpng',
            },
          ],
        });
      }
      if (target.includes('/ftxt'))
        return apiBytes(Buffer.from('hello from slack file\n'));
      if (target.includes('/fpng'))
        return apiBytes(Buffer.from([0, 0, 1, 9, 0]));
      throw new Error(`Unexpected fetch URL: ${target}`);
    });

    const result = await makeAdapter({ limit: 10 }).syncAll();
    expect(result.documents).toHaveLength(1);
    expect(result.documents?.[0]).toMatchObject({ name: 'notes.txt' });
    expect(result.documents?.[0]?.content).toContain('hello from slack');
    expect(result.metadata.skippedBinary).toBe(1);
  });

  it('exports a configured channel into a markdown document', async () => {
    fetchSpy.mockImplementation((url: unknown) => {
      const target = String(url);
      if (target.includes('conversations.list')) {
        return apiJson({ ok: true, channels: [{ id: 'C1', name: 'eng' }] });
      }
      if (target.includes('conversations.history')) {
        return apiJson({
          ok: true,
          messages: [
            { ts: '1710000000.000001', user: 'U1', text: 'Design doc ready' },
          ],
        });
      }
      if (target.includes('files.list'))
        return apiJson({ ok: true, files: [] });
      throw new Error(`Unexpected fetch URL: ${target}`);
    });

    const result = await makeAdapter({ channelId: 'C1' }).syncAll();
    expect(result.documents).toHaveLength(1);
    expect(result.documents?.[0]?.name).toContain('slack-eng.md');
    expect(result.documents?.[0]?.content).toContain('Design doc ready');
  });
});
