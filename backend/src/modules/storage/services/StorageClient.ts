import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
  private csvMimeTypes = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain']);

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
    const lowerName = safeName.toLowerCase();
    if (!lowerName.endsWith('.csv')) {
      throw new Error('Only CSV files are allowed');
    }
    if (mimeType && !this.csvMimeTypes.has(mimeType)) {
      throw new Error('Only CSV files are allowed');
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

  async deleteObject(key: string): Promise<void> {
    const safeKey = key.trim();
    if (!safeKey) {
      throw new Error('Storage key is required');
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: safeKey,
    });

    await this.client.send(command);
  }

  async getSignedDownloadUrl(key: string): Promise<SignedUpload> {
    const safeKey = key.trim();
    if (!safeKey) {
      throw new Error('Storage key is required');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: safeKey,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: this.expiresIn });
    return { url, key: safeKey, expiresIn: this.expiresIn };
  }
}
