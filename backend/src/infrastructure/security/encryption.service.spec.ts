import { ConfigService } from '@nestjs/config';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

describe('EncryptionService', () => {
  const createService = (key = 'test-encryption-key', legacyKeys = '') =>
    new EncryptionService(
      new ConfigService({ ENCRYPTION_KEY: key, ENCRYPTION_KEYS: legacyKeys }),
    );

  it('round-trips a secret', () => {
    const service = createService();
    const ciphertext = service.encrypt('{"token":"slack-xoxb-123"}');

    expect(ciphertext).not.toContain('slack-xoxb-123');
    expect(ciphertext.startsWith('akg:v1:')).toBe(true);
    expect(service.decrypt(ciphertext)).toBe('{"token":"slack-xoxb-123"}');
  });

  it('produces a different ciphertext per call (random IV)', () => {
    const service = createService();
    const plaintext = 'same-secret';

    expect(service.encrypt(plaintext)).not.toBe(service.encrypt(plaintext));
  });

  it('fails to decrypt with a different key', () => {
    const ciphertext = createService('key-a').encrypt('secret');

    expect(() => createService('key-b').decrypt(ciphertext)).toThrow();
  });

  it('throws on malformed payloads', () => {
    const service = createService();

    expect(() => service.decrypt('not-encrypted')).toThrow();
  });

  it('tryDecrypt returns the original value when decryption fails', () => {
    const service = createService();

    expect(service.tryDecrypt('legacy-plaintext')).toBe('legacy-plaintext');
  });

  it('writes ciphertext tagged with the current key version', () => {
    const service = createService('key-new', 'key-old-1,key-old-2');
    const ciphertext = service.encrypt('rotatable');

    expect(service.activeVersion).toBe(3);
    expect(ciphertext.startsWith('akg:v3:')).toBe(true);
    expect(service.decrypt(ciphertext)).toBe('rotatable');
  });

  it('decrypts v1 ciphertext after the key has been rotated onwards', () => {
    const before = createService('key-a').encrypt('old-data');
    expect(before.startsWith('akg:v1:')).toBe(true);

    const after = createService('key-b', 'key-a');
    expect(after.activeVersion).toBe(2);
    expect(after.decrypt(before)).toBe('old-data');
  });

  it('decrypts a key in the middle of the legacy chain', () => {
    const withKeyA = createService('key-a').encrypt('old-data');

    const after = createService('key-c', 'key-a,key-b');
    expect(after.activeVersion).toBe(3);
    expect(after.decrypt(withKeyA)).toBe('old-data');
  });

  it('rejects ciphertext tagged with an unknown future version', () => {
    const service = createService('key-a');

    expect(() => service.decrypt('akg:v99:abc.def.ghi')).toThrow(
      'Unknown encryption key version',
    );
  });

  it('decrypts legacy unversioned payloads with the newest known key', () => {
    const iv = randomBytes(IV_LENGTH);
    const key = createHash('sha256').update('key-a').digest();
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update('legacy-secret', 'utf8'),
      cipher.final(),
    ]);
    const legacy = [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');

    const service = createService('key-a');
    expect(service.decrypt(legacy)).toBe('legacy-secret');
  });
});
