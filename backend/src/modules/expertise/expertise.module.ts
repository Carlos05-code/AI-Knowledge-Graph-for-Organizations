import { Module } from '@nestjs/common';
import { ExpertiseController } from './expertise.controller';
import { ExpertiseService } from './expertise.service';

@Module({
  controllers: [ExpertiseController],
  providers: [ExpertiseService],
  exports: [ExpertiseService],
})
export class ExpertiseModule {}
