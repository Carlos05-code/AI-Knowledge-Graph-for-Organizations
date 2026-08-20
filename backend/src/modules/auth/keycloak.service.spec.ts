import { KeycloakService } from './keycloak.service';
import { AuthService } from './auth.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const jwk = publicKey.export({ format: 'jwk' });

const b64url = (data: string | object) =>
  Buffer.from(JSON.stringify(data))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const signToken = (
  payload: Record<string, unknown>,
  key: crypto.KeyObject = privateKey,
) => {
  const header = b64url({ alg: 'RS256', typ: 'JWT', kid: 'kid1' });
  const body = b64url(payload);
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${body}`)
    .sign(key)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.${signature}`;
};

const envBackup: Record<string, string | undefined> = {};

describe('KeycloakService', () => {
  let service: KeycloakService;
  const mockPrisma: Record<string, any> = {};
  let mockAuth: { issueTokens: jest.Mock };

  const configure = (env: Record<string, string>) => {
    for (const [k, v] of Object.entries(env)) {
      process.env[k] = v;
    }
  };

  beforeEach(async () => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('KEYCLOAK_')) {
        envBackup[key] = process.env[key];
        delete process.env[key];
      }
    }
    configure({
      KEYCLOAK_URL: 'http://keycloak:8080',
      KEYCLOAK_REALM: 'ai-knowledge-graph',
      KEYCLOAK_CLIENT_ID: 'backend',
    });

    (global as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        keys: [{ kty: 'RSA', alg: 'RS256', kid: 'kid1', n: jwk.n, e: jwk.e }],
      }),
    });

    mockAuth = {
      issueTokens: jest.fn().mockResolvedValue({ accessToken: 'jwt' }),
    };
    Object.assign(mockPrisma, {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      organization: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeycloakService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuth },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) => {
              if (process.env[key] !== undefined) return process.env[key];
              if (key === 'KEYCLOAK_DEFAULT_ORG_ID') return undefined;
              return fallback;
            },
          },
        },
      ],
    }).compile();

    service = module.get<KeycloakService>(KeycloakService);
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    for (const key of Object.keys(envBackup)) {
      delete envBackup[key];
    }
  });

  it('is disabled and throws 503 when Keycloak is not configured', async () => {
    delete process.env.KEYCLOAK_URL;
    delete process.env.KEYCLOAK_REALM;

    await expect(service.ssoLogin('some-token')).rejects.toThrow(
      'Keycloak SSO is not configured',
    );
    expect(service.getStatus()).toEqual({
      enabled: false,
      issuer: null,
      jwksUrl: null,
    });
  });

  it('authenticates an existing user by keycloakId and issues tokens', async () => {
    const user = {
      id: 'u1',
      email: 'a@b.com',
      isActive: true,
      keycloakId: 'sub-1',
      organizationId: 'org-1',
      organization: { id: 'org-1' },
      role: 'USER',
    };
    mockPrisma.user.findFirst.mockResolvedValue(user);
    const token = signToken({
      sub: 'sub-1',
      email: 'a@b.com',
      exp: 9999999999,
    });

    const result = await service.ssoLogin(token);

    expect(result).toEqual({ accessToken: 'jwt' });
    expect(mockAuth.issueTokens).toHaveBeenCalledWith(user);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('links an existing email account to the Keycloak sub', async () => {
    const user = {
      id: 'u1',
      email: 'a@b.com',
      isActive: true,
      keycloakId: 'old-sub',
      organizationId: 'org-1',
      organization: { id: 'org-1' },
      role: 'USER',
    };
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.user.update.mockResolvedValue({ ...user, keycloakId: 'sub-2' });
    const token = signToken({
      sub: 'sub-2',
      email: 'a@b.com',
      exp: 9999999999,
    });

    await service.ssoLogin(token);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { keycloakId: 'sub-2' },
      include: { organization: true },
    });
  });

  it('provisions a new user with role mapped from Keycloak realm roles', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: 'org-new' });
    mockPrisma.user.create.mockImplementation(async (args: any) => ({
      id: 'u-new',
      ...args.data,
      organizationId: 'org-new',
      organization: { id: 'org-new' },
      isActive: true,
    }));
    const token = signToken({
      sub: 'sub-3',
      email: 'carol@b.com',
      given_name: 'Carol',
      family_name: 'D',
      preferred_username: 'carol',
      realm_access: { roles: ['admin'] },
      exp: 9999999999,
    });

    const result = await service.ssoLogin(token);

    expect(result).toEqual({ accessToken: 'jwt' });
    expect(mockPrisma.organization.create).toHaveBeenCalled();
    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'carol@b.com',
          keycloakId: 'sub-3',
          role: 'ADMIN',
          firstName: 'Carol',
          lastName: 'D',
        }),
      }),
    );
  });

  it('defaults role to USER when no matching realm role is present', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.organization.create.mockResolvedValue({ id: 'org-new' });
    mockPrisma.user.create.mockImplementation(async (args: any) => ({
      id: 'u-new',
      ...args.data,
      organizationId: 'org-new',
      organization: { id: 'org-new' },
      isActive: true,
    }));
    const token = signToken({
      sub: 'sub-4',
      email: 'dan@b.com',
      realm_access: { roles: ['some-other-role'] },
      exp: 9999999999,
    });

    await service.ssoLogin(token);

    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'USER' }),
      }),
    );
  });

  it('rejects an expired token', async () => {
    const token = signToken({
      sub: 'sub-1',
      email: 'a@b.com',
      exp: Math.floor(Date.now() / 1000) - 120,
    });

    await expect(service.ssoLogin(token)).rejects.toThrow(
      'Keycloak token has expired',
    );
  });

  it('rejects a token signed by an unknown key', async () => {
    const { privateKey: attackerKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const token = signToken({ sub: 'evil', exp: 9999999999 }, attackerKey);

    await expect(service.ssoLogin(token)).rejects.toThrow(
      'Keycloak token signature invalid',
    );
  });

  it('rejects a token for an inactive user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      isActive: false,
      keycloakId: 'sub-1',
      organizationId: 'org-1',
      organization: { id: 'org-1' },
      role: 'USER',
    });
    const token = signToken({
      sub: 'sub-1',
      email: 'a@b.com',
      exp: 9999999999,
    });

    await expect(service.ssoLogin(token)).rejects.toThrow('User is not active');
  });

  it('rejects a token with an issuer mismatch', async () => {
    const token = signToken({
      sub: 'sub-1',
      email: 'a@b.com',
      iss: 'https://evil.example.com/realms/other',
      exp: 9999999999,
    });

    await expect(service.ssoLogin(token)).rejects.toThrow(
      'Keycloak token issuer mismatch',
    );
  });
});
