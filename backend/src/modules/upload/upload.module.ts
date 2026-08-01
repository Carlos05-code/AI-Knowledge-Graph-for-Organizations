import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadController } from './upload.controller';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [MulterModule.register({ dest: './uploads' }), DocumentsModule],
  controllers: [UploadController],
})
export class UploadModule {}
