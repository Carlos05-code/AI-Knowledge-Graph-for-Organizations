import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let service: CacheService;
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  it('should return null on cache miss', async () => {
    mockCache.get.mockResolvedValue(undefined);
    expect(await service.get('k')).toBeNull();

    mockCache.get.mockResolvedValue(null);
    expect(await service.get('k')).toBeNull();
  });

  it('should return the stored value on cache hit', async () => {
    mockCache.get.mockResolvedValue(42);
    expect(await service.get<number>('k')).toBe(42);
  });

  it('should store values with TTL in ms', async () => {
    await service.set('k', { a: 1 }, 15_000);
    expect(mockCache.set).toHaveBeenCalledWith('k', { a: 1 }, 15_000);
  });

  it('should delete keys', async () => {
    await service.del('k');
    expect(mockCache.del).toHaveBeenCalledWith('k');
  });

  it('should swallow underlying store errors (fail-open)', async () => {
    mockCache.get.mockRejectedValue(new Error('redis down'));
    mockCache.set.mockRejectedValue(new Error('redis down'));
    mockCache.del.mockRejectedValue(new Error('redis down'));

    expect(await service.get('k')).toBeNull();
    await expect(service.set('k', 1, 1000)).resolves.toBeUndefined();
    await expect(service.del('k')).resolves.toBeUndefined();
  });
});
