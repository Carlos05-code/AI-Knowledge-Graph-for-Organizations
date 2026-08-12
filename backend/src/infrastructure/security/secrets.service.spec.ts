import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import { SecretsService, JWT_SECRET_NAME } from './secrets.service';

describe('SecretsService', () => {
  const mockPrisma = {
    appSecret: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const createSecrets = (envSecret = 'env-boot-secret') =>
    new SecretsService(
      mockPrisma as unknown as never,
      new EncryptionService(new ConfigService({ ENCRYPTION_KEY: 'k1' })),
      new ConfigService({ JWT_SECRET: envSecret }),
    );

  const encryption = new EncryptionService(
    new ConfigService({ ENCRYPTION_KEY: 'k1' }),
  );
  const atRest = (plaintext: string) => encryption.encrypt(plaintext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the env secret when no rotated secrets exist', async () => {
    mockPrisma.appSecret.findMany.mockResolvedValue([]);

    const secrets = await createSecrets().getActiveJwtSecrets();

    expect(secrets).toEqual(['env-boot-secret']);
  });

  it('prepends rotated secrets newest-version-first', async () => {
    const service = createSecrets();
    const v2 = atRest('rotated-v2-secret');
    const v1 = atRest('rotated-v1-secret');
    mockPrisma.appSecret.findMany.mockResolvedValue([
      { value: v2, version: 2 },
      { value: v1, version: 1 },
    ]);

    const secrets = await service.getActiveJwtSecrets();

    expect(secrets).toEqual([
      'rotated-v2-secret',
      'rotated-v1-secret',
      'env-boot-secret',
    ]);
  });

  it('returns the newest rotated secret as the signing secret', async () => {
    const service = createSecrets();
    const rotated = await service.rotateJwtSecret({ userId: 'admin-1' });
    mockPrisma.appSecret.findMany.mockResolvedValue([
      { value: atRest(rotated.secret), version: 1 },
    ]);

    expect(await service.getSigningSecret()).toBe(rotated.secret);
  });

  it('creates a new version and stores the secret encrypted at rest', async () => {
    const service = createSecrets();
    mockPrisma.appSecret.findMany.mockResolvedValue([{ version: 2 }]);
    mockPrisma.appSecret.create.mockResolvedValue({ id: 'sec-1' });

    const result = await service.rotateJwtSecret({ userId: 'admin-1' });

    expect(result).toMatchObject({ version: 3, rotatedAt: expect.any(String) });
    expect(result.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(mockPrisma.appSecret.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: JWT_SECRET_NAME,
        version: 3,
        isActive: true,
        createdById: 'admin-1',
      }),
    });
    const createArgs = mockPrisma.appSecret.create.mock.calls[0][0] as {
      data: { value: string };
    };
    const stored = createArgs.data.value;
    expect(stored.startsWith('akg:v')).toBe(true);
    expect(stored).not.toContain(result.secret);
  });

  it('falls back to the env secret when the DB is unavailable', async () => {
    mockPrisma.appSecret.findMany.mockRejectedValue(new Error('db down'));

    const secrets = await createSecrets().getActiveJwtSecrets();

    expect(secrets).toEqual(['env-boot-secret']);
  });
});
