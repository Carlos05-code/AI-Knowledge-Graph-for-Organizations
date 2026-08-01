import { Module } from '@nestjs/common';
import { GapsController } from './gaps.controller';
import { GapsService } from './gaps.service';

@Module({
  controllers: [GapsController],
  providers: [GapsService],
  exports: [GapsService],
})
export class GapsModule {}
