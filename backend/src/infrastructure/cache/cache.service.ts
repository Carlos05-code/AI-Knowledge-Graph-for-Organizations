import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.cache.get<T>(key);
      return value === undefined || value === null ? null : value;
    } catch {
      this.logger.debug(`Cache read failed for key ${key}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttlMs);
    } catch {
      this.logger.debug(`Cache write failed for key ${key}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
    } catch {
      this.logger.debug(`Cache delete failed for key ${key}`);
    }
  }
}
