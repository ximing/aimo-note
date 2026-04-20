// packages/core/src/sync/adapter.ts
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { S3Config } from '@aimo-note/dto';

export interface S3ObjectInfo {
  key: string;
  size: number;
  lastModified?: string;
}

export class S3Adapter {
  private client: S3Client;
  private vaultPrefix: string;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.vaultPrefix = 'vault/.aimo/';
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
    });
  }

  getVaultPrefix(): string {
    return this.vaultPrefix;
  }

  async getObject(key: string): Promise<string | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key) })
      );
      const body = await response.Body?.transformToString();
      return body ?? null;
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async putObject(key: string, body: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.resolveKey(key),
        Body: body,
        ContentType: 'application/octet-stream',
      })
    );
  }

  async listObjects(prefix: string): Promise<S3ObjectInfo[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.resolveKey(prefix) })
    );
    return (response.Contents ?? []).map((obj: any) => ({
      key: obj.Key!,
      size: obj.Size ?? 0,
      lastModified: obj.LastModified?.toISOString(),
    }));
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key) })
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key) })
      );
      return true;
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return false;
      throw err;
    }
  }

  /**
   * Get the changelog.json from S3.
   * Returns null if the changelog does not exist yet.
   */
  async getChangelog(): Promise<string | null> {
    return this.getObject('.aimo/changelog.json');
  }

  /**
   * Put the changelog.json to S3.
   */
  async putChangelog(body: string): Promise<void> {
    await this.putObject('.aimo/changelog.json', body);
  }

  private resolveKey(key: string): string {
    if (key.startsWith(this.vaultPrefix)) return key;
    return `${this.vaultPrefix}${key.replace(/^\.aimo\//, '')}`;
  }
}