import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuthService } from './auth.service';
import { UserRole } from '@prisma/client';

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
}

interface KeycloakClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

const ROLE_MAP: Record<string, UserRole> = {
  admin: 'ADMIN',
  user: 'USER',
  viewer: 'VIEWER',
};

@Injectable()
export class KeycloakService {
  private readonly logger = new Logger(KeycloakService.name);
  private jwksCache: { keys: Jwk[]; expiresAt: number } | null = null;

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  get issuer(): string | null {
    const url = this.config.get<string>('KEYCLOAK_URL');
    const realm = this.config.get<string>('KEYCLOAK_REALM');
    return url && realm ? `${url}/realms/${realm}` : null;
  }

  get enabled(): boolean {
    return (
      !!this.config.get<string>('KEYCLOAK_URL') &&
      !!this.config.get<string>('KEYCLOAK_REALM')
    );
  }

  getStatus() {
    const issuer = this.issuer;
    return {
      enabled: this.enabled,
      issuer,
      jwksUrl: issuer ? `${issuer}/protocol/openid-connect/certs` : null,
    };
  }

  async ssoLogin(accessToken: string) {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Keycloak SSO is not configured on this server',
      );
    }

    const claims = await this.verifyAccessToken(accessToken);
    if (!claims.sub) {
      throw new UnauthorizedException('Invalid Keycloak token');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ keycloakId: claims.sub }, { email: claims.email || '' }],
      },
      include: { organization: true },
    });

    let user = existing;
    if (user && user.keycloakId !== claims.sub) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { keycloakId: claims.sub },
        include: { organization: true },
      });
    }

    if (!user) {
      user = await this.provisionUser(claims);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User is not active');
    }

    return this.authService.issueTokens(user);
  }

  async verifyAccessToken(token: string): Promise<KeycloakClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed Keycloak token');
    }
    const [headerB64, payloadB64, signatureB64] = parts;

    let header: { alg?: string; kid?: string };
    let payload: KeycloakClaims;
    try {
      header = JSON.parse(this.base64UrlDecode(headerB64));
      payload = JSON.parse(this.base64UrlDecode(payloadB64));
    } catch {
      throw new UnauthorizedException('Malformed Keycloak token');
    }

    if (header.alg !== 'RS256') {
      throw new UnauthorizedException('Unsupported Keycloak token algorithm');
    }

    if (payload.exp && payload.exp * 1000 < Date.now() + 30_000) {
      throw new UnauthorizedException('Keycloak token has expired');
    }

    const issuer = this.issuer;
    if (issuer && payload.iss && payload.iss !== issuer) {
      throw new UnauthorizedException('Keycloak token issuer mismatch');
    }

    const clientId = this.config.get<string>('KEYCLOAK_CLIENT_ID');
    if (clientId && payload.aud) {
      const audiences = Array.isArray(payload.aud)
        ? payload.aud
        : [payload.aud];
      if (!audiences.includes(clientId)) {
        throw new UnauthorizedException('Keycloak token audience mismatch');
      }
    }

    const key = await this.findSigningKey(header.kid);
    if (!key) {
      throw new UnauthorizedException('No matching Keycloak signing key');
    }

    const publicKey = crypto.createPublicKey({
      key: { kty: key.kty, n: key.n, e: key.e },
      format: 'jwk',
    });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(
      signatureB64.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    );
    if (!verifier.verify(publicKey, signature)) {
      throw new UnauthorizedException('Keycloak token signature invalid');
    }

    return payload;
  }

  private async findSigningKey(kid?: string): Promise<Jwk | undefined> {
    const keys = await this.getJwks();
    if (kid) {
      return keys.find((k) => k.kid === kid);
    }
    return keys.find((k) => k.alg === 'RS256') ?? keys[0];
  }

  private async getJwks(): Promise<Jwk[]> {
    if (this.jwksCache && this.jwksCache.expiresAt > Date.now()) {
      return this.jwksCache.keys;
    }

    const issuer = this.issuer;
    if (!issuer) {
      throw new ServiceUnavailableException(
        'Keycloak SSO is not configured on this server',
      );
    }
    const jwksUrl = this.config.get<string>(
      'KEYCLOAK_JWKS_URL',
      `${issuer}/protocol/openid-connect/certs`,
    );

    let response: Response;
    try {
      response = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
    } catch (err) {
      this.logger.error(`Keycloak JWKS fetch failed: ${String(err)}`);
      throw new ServiceUnavailableException('Keycloak is unreachable');
    }
    if (!response.ok) {
      this.logger.error(
        `Keycloak JWKS fetch failed with status ${response.status}`,
      );
      throw new ServiceUnavailableException('Keycloak is unreachable');
    }

    const data = (await response.json()) as { keys?: Jwk[] };
    const keys = data.keys ?? [];
    if (keys.length === 0) {
      throw new ServiceUnavailableException(
        'Keycloak returned no signing keys',
      );
    }

    this.jwksCache = { keys, expiresAt: Date.now() + 5 * 60 * 1000 };
    return keys;
  }

  private async provisionUser(claims: KeycloakClaims) {
    const email = claims.email?.toLowerCase();
    if (!email) {
      throw new UnauthorizedException(
        'Keycloak token has no email claim for provisioning',
      );
    }

    const orgName = claims.preferred_username || email.split('@')[0];
    const defaultOrgId = this.config.get<string>('KEYCLOAK_DEFAULT_ORG_ID');
    const organization = defaultOrgId
      ? await this.prisma.organization.findUnique({
          where: { id: defaultOrgId },
        })
      : null;

    let organizationId: string;
    if (organization) {
      organizationId = organization.id;
    } else {
      const created = await this.prisma.organization.create({
        data: {
          name: `${orgName}'s Organization`,
          slug: `sso-${crypto
            .randomBytes(4)
            .toString(
              'hex',
            )}-${orgName.toLowerCase().replace(/[^a-z0-9-]/g, '')}`,
        },
      });
      organizationId = created.id;
    }

    const realmRoles = claims.realm_access?.roles ?? [];
    const role = realmRoles.map((r) => ROLE_MAP[r]).find(Boolean) ?? 'USER';

    return this.prisma.user.create({
      data: {
        email,
        password: null,
        firstName: claims.given_name || orgName,
        lastName: claims.family_name || '',
        keycloakId: claims.sub,
        organizationId,
        role,
        isActive: true,
      },
      include: { organization: true },
    });
  }

  private base64UrlDecode(value: string): string {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(padded, 'base64').toString('utf8');
  }
}
