import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { SecretsService } from './secrets.service';

@Global()
@Module({
  providers: [EncryptionService, SecretsService],
  exports: [EncryptionService, SecretsService],
})
export class SecurityModule {}
