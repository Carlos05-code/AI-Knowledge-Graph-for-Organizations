import { Module } from '@nestjs/common';
import { GraphController } from './graph.controller';

@Module({
  controllers: [GraphController],
})
export class GraphModule {}
