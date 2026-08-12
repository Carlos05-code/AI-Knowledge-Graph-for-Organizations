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
const VERSION_PREFIX_REGEX = /^akg:v(\d+):/;

/**
 * AES-256-GCM encryption with key versioning.
 *
 * Current ciphertext format: `akg:v{N}.{iv}.{tag}.{cipher}` where N is the
 * 1-based version of the key that encrypted the payload. Payloads produced
 * before versioning (plain `{iv}.{tag}.{cipher}`) are still decrypted by
 * falling back through the legacy key chain.
 *
 * Key sources (in the resolution order used by decrypt):
 *  - version N payload -> the Nth entry of `ENCRYPTION_KEYS`
 *    (legacy keys, oldest first) falling back to `ENCRYPTION_KEY` itself.
 *  - unversioned payload -> every known key is attempted, newest first.
 *
 * Rotation procedure (see SECURITY_SPEC):
 *  1. Set ENCRYPTION_KEYS to the previous key(s), comma separated.
 *  2. Set ENCRYPTION_KEY to the new key and restart all instances.
 *  3. Old ciphertext continues to decrypt (v1..vN entries); new ciphertext
 *     is written as `akg:v{N+1}.` with the new key.
 *  4. Re-encrypt any sensitive single rows via decrypt() + encrypt() with
 *     the deployed configuration when compacting key history.
 */
@Injectable()
export class EncryptionService {
  private readonly keys: Buffer[] = [];
  private readonly currentVersion: number;

  constructor(config: ConfigService) {
    const current =
      String(config.get('ENCRYPTION_KEY', DEV_FALLBACK_KEY)).trim() ||
      DEV_FALLBACK_KEY;
    const legacy = String(config.get('ENCRYPTION_KEYS', '') ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    this.keys = [...legacy, current].map((key) =>
      createHash('sha256').update(key).digest(),
    );
    this.currentVersion = this.keys.length;
  }

  get activeVersion(): number {
    return this.currentVersion;
  }

  encrypt(plaintext: string): string {
    const key = this.keys[this.keys.length - 1];
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const body = [
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
    return `akg:v${this.currentVersion}:${body}`;
  }

  decrypt(payload: string): string {
    const versionMatch = VERSION_PREFIX_REGEX.exec(payload);
    if (versionMatch) {
      const version = Number(versionMatch[1]);
      const key = this.keys[version - 1];
      if (!key) {
        throw new Error('Unknown encryption key version');
      }
      return this.decryptBody(payload.slice(versionMatch[0].length), key);
    }
    for (let i = this.keys.length - 1; i >= 0; i--) {
      try {
        return this.decryptBody(payload, this.keys[i]);
      } catch {
        // try the next older key
      }
    }
    throw new Error('Malformed encrypted payload');
  }

  tryDecrypt(payload: string): string {
    try {
      return this.decrypt(payload);
    } catch {
      return payload;
    }
  }

  private decryptBody(body: string, key: Buffer): string {
    const parts = body.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted payload');
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(parts[0], 'base64'),
    );
    decipher.setAuthTag(Buffer.from(parts[1], 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parts[2], 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
