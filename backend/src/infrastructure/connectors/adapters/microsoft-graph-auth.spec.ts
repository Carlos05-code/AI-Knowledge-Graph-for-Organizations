import { MicrosoftGraphAuth } from './microsoft-graph-auth';

describe('MicrosoftGraphAuth', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.clearAllMocks();
  });

  const config = {
    tenantId: 'tenant-1',
    clientId: 'client-1',
    clientSecret: 'secret-1',
  };

  const json = (body: unknown, ok = true, status = 200) =>
    ({ ok, status, json: () => Promise.resolve(body) }) as Response;

  it('requests a token via client-credentials against the tenant endpoint', async () => {
    fetchSpy.mockResolvedValue(
      json({ access_token: 'token-abc', expires_in: 3600 }),
    );
    const token = await new MicrosoftGraphAuth(config).getAccessToken();
    expect(token).toBe('token-abc');

    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token',
    );
    const body = new URLSearchParams(options.body);
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('scope')).toBe('https://graph.microsoft.com/.default');
  });

  it('throws when tenantId is missing', async () => {
    await expect(
      new MicrosoftGraphAuth({
        clientId: 'c',
        clientSecret: 's',
      }).getAccessToken(),
    ).rejects.toThrow(/tenant is missing/);
  });

  it('throws when clientId is missing', async () => {
    await expect(
      new MicrosoftGraphAuth({
        tenantId: 't',
        clientSecret: 's',
      }).getAccessToken(),
    ).rejects.toThrow(/client ID is missing/);
  });

  it('throws when clientSecret is missing', async () => {
    await expect(
      new MicrosoftGraphAuth({ tenantId: 't', clientId: 'c' }).getAccessToken(),
    ).rejects.toThrow(/client secret is missing/);
  });

  it('throws a descriptive error on a failed token response', async () => {
    fetchSpy.mockResolvedValue(
      json({ error_description: 'invalid_client' }, false, 401),
    );
    await expect(
      new MicrosoftGraphAuth(config).getAccessToken(),
    ).rejects.toThrow('invalid_client');
  });

  it('caches the token across calls within its expiry window', async () => {
    fetchSpy.mockResolvedValue(
      json({ access_token: 'token-abc', expires_in: 3600 }),
    );
    const auth = new MicrosoftGraphAuth(config);
    await auth.getAccessToken();
    await auth.getAccessToken();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('forces a fresh token when forceRefresh is true', async () => {
    fetchSpy.mockResolvedValue(
      json({ access_token: 'token-abc', expires_in: 3600 }),
    );
    const auth = new MicrosoftGraphAuth(config);
    await auth.getAccessToken();
    await auth.getAccessToken(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
