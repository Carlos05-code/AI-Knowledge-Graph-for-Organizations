import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import * as crypto from 'crypto';

process.env.KEYCLOAK_URL = 'http://keycloak:8080';
process.env.KEYCLOAK_REALM = 'ai-knowledge-graph';
process.env.KEYCLOAK_CLIENT_ID = 'backend';

const kcKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const kcJwk = kcKeyPair.publicKey.export({ format: 'jwk' });

const kcB64url = (data: string | object) =>
  Buffer.from(JSON.stringify(data))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const kcSignToken = (payload: Record<string, unknown>) => {
  const header = kcB64url({ alg: 'RS256', typ: 'JWT', kid: 'kc-kid' });
  const body = kcB64url(payload);
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${body}`)
    .sign(kcKeyPair.privateKey)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.${signature}`;
};

// Imported after the env vars above are set, since ConfigService reads
// them when KeycloakService is constructed during app bootstrap.
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Keycloak SSO (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  let mockPrisma: E2EContext['mockPrisma'];

  beforeAll(async () => {
    ctx = await bootstrapE2eApp();
    ({ app, mockPrisma } = ctx);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetE2eMockDefaults(ctx);

    const fetchSpy = jest.spyOn(global as any, 'fetch');
    fetchSpy.mockImplementation((url: unknown) => {
      const target = String(url);
      if (target.includes('/protocol/openid-connect/certs')) {
        return {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              keys: [
                {
                  kty: 'RSA',
                  alg: 'RS256',
                  kid: 'kc-kid',
                  n: kcJwk.n,
                  e: kcJwk.e,
                },
              ],
            }),
        };
      }
      return Promise.reject(new Error(`unexpected fetch: ${target}`));
    });
  });

  it('GET /api/v1/auth/sso/keycloak/status reports enabled and issuer', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/auth/sso/keycloak/status')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.enabled).toBe(true);
        expect(res.body.data.issuer).toBe(
          'http://keycloak:8080/realms/ai-knowledge-graph',
        );
      });
  });

  it('POST /api/v1/auth/sso/keycloak provisions and authenticates a new user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: 'org-e2e' });
    mockPrisma.user.create.mockImplementation(async (args: any) => ({
      id: 'kc-user-1',
      ...args.data,
      organizationId: 'org-e2e',
      organization: { id: 'org-e2e', name: 'X', slug: 'x' },
      isActive: true,
    }));
    mockPrisma.refreshToken.create.mockResolvedValue({
      id: 'rt-1',
      token: 'refresh-1',
    });

    const token = kcSignToken({
      sub: 'kc-sub-1',
      email: 'sso@acme.com',
      given_name: 'Sso',
      family_name: 'User',
      preferred_username: 'sso',
      realm_access: { roles: ['admin'] },
      exp: 9999999999,
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/sso/keycloak')
      .send({ accessToken: token })
      .expect(201)
      .expect((res) => {
        expect(res.body.data.accessToken).toBeDefined();
        expect(res.body.data.user.email).toBe('sso@acme.com');
      });

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          keycloakId: 'kc-sub-1',
          role: 'ADMIN',
          email: 'sso@acme.com',
        }),
      }),
    );
  });

  it('POST /api/v1/auth/sso/keycloak links an existing email account', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'existing-1',
      email: 'sso@acme.com',
      keycloakId: 'other-sub',
      isActive: true,
      organizationId: 'org-e2e',
      organization: { id: 'org-e2e', name: 'X', slug: 'x' },
      role: 'USER',
    });
    mockPrisma.user.update.mockResolvedValue({
      id: 'existing-1',
      email: 'sso@acme.com',
      keycloakId: 'kc-sub-2',
      isActive: true,
      organizationId: 'org-e2e',
      organization: { id: 'org-e2e', name: 'X', slug: 'x' },
      role: 'USER',
    });
    mockPrisma.refreshToken.create.mockResolvedValue({
      id: 'rt-2',
      token: 'refresh-2',
    });

    const token = kcSignToken({
      sub: 'kc-sub-2',
      email: 'sso@acme.com',
      exp: 9999999999,
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/sso/keycloak')
      .send({ accessToken: token })
      .expect(201)
      .expect((res) => {
        expect(res.body.data.user.id).toBe('existing-1');
      });

    expect(mockPrisma.user.update).toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('POST /api/v1/auth/sso/keycloak rejects an invalid token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/sso/keycloak')
      .send({ accessToken: 'garbage.not-a-token.sig' })
      .expect(401);
  });
});
