import { Global, Module } from '@nestjs/common';
import { ConnectorRegistryService } from './connector-registry.service';

@Global()
@Module({
  providers: [ConnectorRegistryService],
  exports: [ConnectorRegistryService],
})
export class ConnectorRegistryModule {}
