import { Global, Logger, Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { ConfigService } from '@nestjs/config';
import { KeyvAdapter } from 'cache-manager';
import Keyv from 'keyv';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async (config: ConfigService) => {
        const host = config.get('REDIS_HOST', 'localhost');
        const port = config.get('REDIS_PORT', 6379);

        try {
          const store = await redisStore({
            socket: {
              host,
              port,
            },
            password: config.get('REDIS_PASSWORD', undefined),
          });
          Logger.log(`Cache store: Redis (${host}:${port})`, CacheModule.name);
          return { store, ttl: 300 };
        } catch {
          Logger.warn(
            `Redis unavailable at ${host}:${port} — falling back to in-memory cache`,
            CacheModule.name,
          );
          return { store: new KeyvAdapter(new Keyv() as never), ttl: 300 };
        }
      },
      inject: [ConfigService],
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
