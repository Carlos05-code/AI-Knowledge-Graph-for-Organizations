import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const createService = (key = 'test-encryption-key') =>
    new EncryptionService(
      new ConfigService({ ENCRYPTION_KEY: key }),
    );

  it('round-trips a secret', () => {
    const service = createService();
    const ciphertext = service.encrypt('{"token":"slack-xoxb-123"}');

    expect(ciphertext).not.toContain('slack-xoxb-123');
    expect(ciphertext.split('.')).toHaveLength(3);
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
});
