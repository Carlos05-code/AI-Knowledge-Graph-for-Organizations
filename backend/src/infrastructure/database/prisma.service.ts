import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

type PrismaServiceOptions = {
  log: [
    { emit: 'event'; level: 'query' },
    { emit: 'stdout'; level: 'info' },
    { emit: 'stdout'; level: 'warn' },
    { emit: 'stdout'; level: 'error' },
  ];
};

@Injectable()
export class PrismaService
  extends PrismaClient<PrismaServiceOptions>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    const slowQueryMs = Number(process.env.SLOW_QUERY_MS ?? 500);
    if (slowQueryMs > 0) {
      void this.$on('query', (e: Prisma.QueryEvent) => {
        if (e.duration > slowQueryMs) {
          this.logger.warn(
            `Slow query (${e.duration}ms > ${slowQueryMs}ms): ${e.target}`,
          );
        }
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }
}
