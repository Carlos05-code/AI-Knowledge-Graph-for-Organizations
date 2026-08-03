import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const DEV_FALLBACK_KEY = 'akg-dev-fallback-key-change-in-production';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = createHash('sha256')
      .update(config.get('ENCRYPTION_KEY', DEV_FALLBACK_KEY).trim() || DEV_FALLBACK_KEY)
      .digest();
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
  }

  decrypt(payload: string): string {
    const parts = payload.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted payload');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(parts[0], 'base64'),
    );
    decipher.setAuthTag(Buffer.from(parts[1], 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parts[2], 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  tryDecrypt(payload: string): string {
    try {
      return this.decrypt(payload);
    } catch {
      return payload;
    }
  }
}
