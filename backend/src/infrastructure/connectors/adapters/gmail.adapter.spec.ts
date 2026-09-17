import { GmailAdapter } from './gmail.adapter';

const mockGmail = {
  users: {
    messages: {
      list: jest.fn(),
      get: jest.fn(),
    },
  },
};

const mockOAuth2Instance = {
  setCredentials: jest.fn(),
  refreshAccessToken: jest.fn(),
};

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => mockOAuth2Instance) },
    gmail: jest.fn().mockImplementation(() => mockGmail),
  },
}));

describe('GmailAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new GmailAdapter({
      clientId: 'id',
      clientSecret: 'secret',
      accessToken: 'token',
      refreshToken: 'refresh',
      ...overrides,
    });

  const b64url = (text: string) =>
    Buffer.from(text)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  it('authenticates by constructing an OAuth2 client with credentials', async () => {
    await makeAdapter().authenticate();
    expect(mockOAuth2Instance.setCredentials).toHaveBeenCalledWith({
      access_token: 'token',
      refresh_token: 'refresh',
    });
  });

  it('lists message ids then fetches metadata for each', async () => {
    mockGmail.users.messages.list.mockResolvedValue({
      data: { messages: [{ id: 'm1' }] },
    });
    mockGmail.users.messages.get.mockResolvedValue({
      data: {
        id: 'm1',
        internalDate: '1700000000000',
        payload: {
          headers: [
            { name: 'Subject', value: 'Welcome' },
            { name: 'From', value: 'boss@acme.com' },
          ],
        },
      },
    });

    const files = await makeAdapter().listFiles();
    expect(files).toEqual([
      expect.objectContaining({ id: 'm1', name: 'Welcome' }),
    ]);
    expect(mockGmail.users.messages.get).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'me', id: 'm1', format: 'metadata' }),
    );
  });

  it('paginates message listing via nextPageToken', async () => {
    mockGmail.users.messages.list
      .mockResolvedValueOnce({
        data: { messages: [{ id: 'm1' }], nextPageToken: 'p2' },
      })
      .mockResolvedValueOnce({ data: { messages: [{ id: 'm2' }] } });
    mockGmail.users.messages.get.mockImplementation(({ id }: any) =>
      Promise.resolve({ data: { id, payload: { headers: [] } } }),
    );

    const files = await makeAdapter().listFiles();
    expect(files.map((f) => f.id)).toEqual(['m1', 'm2']);
  });

  it('passes a search query through to messages.list as `q`', async () => {
    mockGmail.users.messages.list.mockResolvedValue({ data: { messages: [] } });
    await makeAdapter().searchFiles('invoice');
    expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'invoice' }),
    );
  });

  it('extracts the text/plain MIME part and renders headers on download', async () => {
    mockGmail.users.messages.get.mockResolvedValue({
      data: {
        id: 'm1',
        payload: {
          headers: [
            { name: 'Subject', value: 'Quarterly report' },
            { name: 'From', value: 'boss@acme.com' },
            { name: 'Date', value: '2026-01-01' },
          ],
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/html',
              body: { data: b64url('<p>ignored</p>') },
            },
            {
              mimeType: 'text/plain',
              body: { data: b64url('See attached.') },
            },
          ],
        },
      },
    });

    const buffer = await makeAdapter().downloadFile('m1');
    const text = buffer.toString('utf-8');
    expect(text).toContain('# Quarterly report');
    expect(text).toContain('From: boss@acme.com');
    expect(text).toContain('See attached.');
    expect(text).not.toContain('ignored');
  });

  it('syncs messages into documents and reports per-message errors', async () => {
    mockGmail.users.messages.list.mockResolvedValue({
      data: { messages: [{ id: 'ok' }, { id: 'bad' }] },
    });
    mockGmail.users.messages.get.mockImplementation(({ id }: any) => {
      if (id === 'bad') return Promise.reject(new Error('403 Forbidden'));
      return Promise.resolve({
        data: {
          id,
          payload: {
            headers: [{ name: 'Subject', value: 'Ok' }],
            mimeType: 'text/plain',
            body: { data: b64url('hello') },
          },
        },
      });
    });

    const result = await makeAdapter().syncAll();
    expect(result.documentsSynced).toBe(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ fileId: 'bad', error: '403 Forbidden' }),
    ]);
    expect(result.documents?.[0]).toEqual(
      expect.objectContaining({ id: 'ok', name: 'Ok.md' }),
    );
  });
});
