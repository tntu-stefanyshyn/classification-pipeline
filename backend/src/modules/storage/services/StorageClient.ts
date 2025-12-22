import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../../config/config';

export type SignedUpload = {
  url: string;
  key: string;
  expiresIn: number;
};

export class StorageClient {
  private client: S3Client;
  private bucket: string;
  private expiresIn: number;

  constructor() {
    if (!config.s3.bucket || !config.s3.region) {
      throw new Error('S3 bucket and region must be configured');
    }

    this.bucket = config.s3.bucket;
    this.expiresIn = config.s3.presignExpiresSeconds || 900;
    this.client = new S3Client({
      region: config.s3.region,
      credentials:
        config.s3.accessKeyId && config.s3.secretAccessKey
          ? {
              accessKeyId: config.s3.accessKeyId,
              secretAccessKey: config.s3.secretAccessKey,
            }
          : undefined,
    });
  }

  async getSignedUploadUrl(filename: string, mimeType?: string): Promise<SignedUpload> {
    const safeName = filename.trim();
    if (!safeName) {
      throw new Error('Filename is required');
    }
    const key = `uploads/${Date.now()}-${safeName}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: this.expiresIn });
    return { url, key, expiresIn: this.expiresIn };
  }
}
