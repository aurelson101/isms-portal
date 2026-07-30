import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Client } from 'minio';
import type { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  readonly bucket = process.env.MINIO_BUCKET || 'isms-documents';
  private readonly client = new Client({
    endPoint: process.env.MINIO_ENDPOINT || 'minio',
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'isms-minio',
    secretKey: process.env.MINIO_SECRET_KEY || '',
  });

  async onModuleInit() {
    try {
      if (!(await this.client.bucketExists(this.bucket))) {
        await this.client.makeBucket(this.bucket);
      }
      await this.client.setBucketPolicy(this.bucket, JSON.stringify({
        Version: '2012-10-17',
        Statement: [],
      }));
    } catch (error) {
      throw new ServiceUnavailableException(`MinIO initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  putObject(objectKey: string, content: Buffer, metadata: Record<string, string>) {
    return this.client.putObject(this.bucket, objectKey, content, content.length, metadata);
  }

  getObject(objectKey: string): Promise<Readable> {
    return this.client.getObject(this.bucket, objectKey);
  }

  statObject(objectKey: string) {
    return this.client.statObject(this.bucket, objectKey);
  }

  async removeObject(objectKey: string) {
    await this.client.removeObject(this.bucket, objectKey);
  }
}
