import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { EncryptionService } from './encryption.service';

export const JWT_SECRET_NAME = 'JWT_SECRET';

/**
 * Versioned application secrets.
 *
 * JWT signing secrets support dual-key rotation:
 *  - the env `JWT_SECRET` is the boot-time secret and is always accepted;
 *  - rotated secrets are stored encrypted at rest (AppSecret) and are
 *    accepted for verification + used for signing once rotated.
 *
 * Rotation procedure (see SECURITY_SPEC):
 *  1. An ADMIN calls POST /admin/secrets/rotate-jwt.
 *  2. A new random secret is generated, stored encrypted (new version),
 *     and returned exactly once so ops can persist it to env/JWT_SECRET
 *     for subsequent restarts.
 *  3. Previous secrets stay active: tokens signed before the rotation keep
 *     validating until their natural expiry (dual-key grace window).
 *  4. After all live sessions have re-authenticated, ops may deactivate
 *     superseded rows (update isActive=false) to shrink the key set.
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  getEnvJwtSecret(): string {
    return this.config.get('JWT_SECRET', 'default-secret-change-in-production');
  }

  /**
   * JWT secrets accepted for verification, newest rotated first and the
   * env boot secret last. Never rejects: DB unavailability degrades to
   * the env secret only so the API stays up during partial failures.
   */
  async getActiveJwtSecrets(): Promise<string[]> {
    const candidates = [] as string[];
    try {
      const rows = await this.prisma.appSecret.findMany({
        where: { name: JWT_SECRET_NAME, isActive: true },
        orderBy: { version: 'desc' },
      });
      for (const row of rows) {
        const value = this.encryption.tryDecrypt(row.value);
        if (value !== row.value) {
          candidates.push(value);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not load rotated JWT secrets, falling back to env: ${String(error)}`,
      );
    }
    return [...candidates, this.getEnvJwtSecret()];
  }

  /**
   * Secret used to sign new tokens: the newest rotated secret if any,
   * otherwise the env boot secret.
   */
  async getSigningSecret(): Promise<string> {
    const active = await this.getActiveJwtSecrets();
    return active[0];
  }

  /**
   * Generate + persist a new JWT signing secret. Returns the plaintext
   * secret exactly once (kept encrypted at rest afterwards).
   */
  async rotateJwtSecret(authContext: {
    userId?: string;
  }): Promise<{ secret: string; version: number; rotatedAt: string }> {
    const name = JWT_SECRET_NAME;
    const existing = await this.prisma.appSecret.findMany({
      where: { name },
      orderBy: { version: 'desc' },
      take: 1,
    });
    const version = (existing[0]?.version ?? 0) + 1;
    const secret = randomBytes(32).toString('hex');

    await this.prisma.appSecret.create({
      data: {
        name,
        version,
        value: this.encryption.encrypt(secret),
        isActive: true,
        createdById: authContext.userId ?? null,
      },
    });

    return { secret, version, rotatedAt: new Date().toISOString() };
  }
}
