import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { verify } from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SecretsService } from '../../../infrastructure/security/secrets.service';

interface JwtPayload {
  sub: string;
  email: string;
  orgId: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private secrets: SecretsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: (
        request: Record<string, unknown>,
        rawJwtToken: unknown,
        done: (err: null, secret?: string) => void,
      ) => {
        void this.resolveCandidateSecret(request, rawJwtToken)
          .then((secret) => done(null, secret))
          .catch((error) => done(error as never, undefined));
      },
      ignoreExpiration: false,
    });
  }

  /**
   * Verify the presented token against every active secret (env boot secret
   * + rotated AppSecret rows) and return the one that signs it, so tokens
   * issued before a rotation keep validating during the grace window.
   */
  private async resolveCandidateSecret(
    request: Record<string, unknown>,
    rawJwtToken?: unknown,
  ): Promise<string> {
    const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    const token =
      bearerToken ?? (typeof rawJwtToken === 'string' ? rawJwtToken : '');
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }
    const candidates = await this.secrets.getActiveJwtSecrets();
    for (const candidate of candidates) {
      try {
        verify(token, candidate);
        return candidate;
      } catch {
        // try the next active secret
      }
    }
    throw new UnauthorizedException('Invalid token signature');
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      organizationId: user.organizationId,
      role: user.role,
      permissions: [],
    };
  }
}
