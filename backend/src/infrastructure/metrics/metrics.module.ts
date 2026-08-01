import { Global, Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/api/v1/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
})
export class MetricsModule {}
