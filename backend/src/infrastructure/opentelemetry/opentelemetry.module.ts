import { Module, Global } from '@nestjs/common';
import { NodeSDK } from '@opentelemetry/sdk-node';

@Global()
@Module({
  providers: [
    {
      provide: 'OTEL_TRACER_PROVIDER',
      useFactory: () => {
        const sdk = new NodeSDK({
          serviceName: process.env.OTEL_SERVICE_NAME ?? 'akg-backend',
        });
        sdk.start();
        return sdk;
      },
    },
  ],
  exports: ['OTEL_TRACER_PROVIDER'],
})
export class OtelModule {}
