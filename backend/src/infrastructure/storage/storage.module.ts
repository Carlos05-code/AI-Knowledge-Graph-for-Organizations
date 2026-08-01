import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { MinioStorageService } from './minio-storage.service';

@Global()
@Module({
  providers: [
    {
      provide: 'S3_CLIENT',
      useFactory: (config: ConfigService) =>
        new S3Client({
          endpoint: config.get('MINIO_HOST', 'http://localhost:9000'),
          region: 'us-east-1',
          credentials: {
            accessKeyId: config.get('MINIO_ACCESS_KEY', 'minioadmin'),
            secretAccessKey: config.get('MINIO_SECRET_KEY', 'minioadmin'),
          },
          forcePathStyle: true,
        }),
      inject: [ConfigService],
    },
    MinioStorageService,
  ],
  exports: [MinioStorageService],
})
export class StorageModule {}
