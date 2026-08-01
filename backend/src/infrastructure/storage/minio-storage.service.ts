import { Injectable, Inject, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class MinioStorageService {
  private readonly logger = new Logger(MinioStorageService.name);
  private readonly bucket: string;

  constructor(
    @Inject('S3_CLIENT') private readonly s3Client: S3Client,
    private readonly config: ConfigService,
  ) {
    this.bucket = config.get('MINIO_BUCKET', 'knowledge-graph');
  }

  async upload(key: string, body: Buffer | Readable, mimeType: string): Promise<string> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
      }),
    );
    this.logger.log(`Uploaded ${key}`);
    return key;
  }

  async download(key: string): Promise<Readable> {
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return response.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.log(`Deleted ${key}`);
  }

  async list(prefix: string): Promise<string[]> {
    const response = await this.s3Client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }),
    );
    return (response.Contents || []).map((obj) => obj.Key || '');
  }

  getUrl(key: string): string {
    return `${this.config.get('MINIO_HOST')}/${this.bucket}/${key}`;
  }
}
