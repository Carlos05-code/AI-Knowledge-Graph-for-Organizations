/**
 * Registered via jest-e2e.json's `setupFiles` so every e2e spec file gets
 * these module mocks before AppModule (and its queue/mail/auth providers)
 * is ever imported, without each split-out spec file repeating them.
 */
jest.mock('uuid', () => ({ v4: () => 'fixed-uuid-for-testing' }));

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn(),
      consume: jest.fn(),
      ack: jest.fn(),
    }),
  }),
}));

jest.mock('amqp-connection-manager', () => ({
  connect: jest
    .fn()
    .mockReturnValue({ createChannel: jest.fn().mockResolvedValue({}) }),
}));

jest.mock('cache-manager-redis-yet', () => ({
  redisStore: jest
    .fn()
    .mockResolvedValue({ get: jest.fn(), set: jest.fn(), del: jest.fn() }),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest
    .fn()
    .mockImplementation((pw: string, _hash: string) =>
      Promise.resolve(pw === 'password123'),
    ),
}));
