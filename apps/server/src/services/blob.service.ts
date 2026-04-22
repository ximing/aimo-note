import { Service } from 'typedi';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getDb } from '../db/connection.js';
import { blobs, type NewBlob } from '../db/schema/blobs.js';
import { getConfig } from '../config/config.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { VaultService } from './vault.service.js';

// Maximum file size: 100MB
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export class BlobNotFoundError extends Error {
  code = ErrorCodes.RESOURCE_NOT_FOUND;
  constructor(blobHash: string, vaultId: string) {
    super(`Blob not found: ${blobHash} in vault ${vaultId}`);
    this.name = 'BlobNotFoundError';
  }
}

export class BlobAlreadyExistsError extends Error {
  code = ErrorCodes.RESOURCE_ALREADY_EXISTS;
  constructor(blobHash: string, vaultId: string) {
    super(`Blob already exists: ${blobHash} in vault ${vaultId}`);
    this.name = 'BlobAlreadyExistsError';
  }
}

export interface BlobMetadata {
  blobHash: string;
  sizeBytes: number;
  mimeType: string | null;
  storageKey: string;
  refCount: number;
  createdAt: Date;
}

/**
 * Generate storage key for a blob
 * Pattern: users/{userId}/vaults/{vaultId}/blobs/sha256/{hashPrefix}/{fullHash}
 */
function generateStorageKey(userId: string, vaultId: string, blobHash: string): string {
  const hashPrefix = blobHash.slice(0, 4);
  return `users/${userId}/vaults/${vaultId}/blobs/sha256/${hashPrefix}/${blobHash}`;
}

/**
 * BlobService handles blob storage operations including:
 * - Checking which blobs exist (hasBlobs)
 * - Generating presigned upload URLs (createBlobUploadUrl)
 * - Generating presigned download URLs (createBlobDownloadUrl)
 * - Recording blob metadata with refCount
 */
@Service()
export class BlobService {
  private s3Client: S3Client | null = null;

  constructor(private readonly vaultService: VaultService) {}

  /**
   * Get or create S3 client lazily
   */
  private getS3Client(): S3Client {
    if (!this.s3Client) {
      const config = getConfig();
      this.s3Client = new S3Client({
        region: config.syncS3.region,
        endpoint: config.syncS3.endpoint,
        credentials: {
          accessKeyId: config.syncS3.accessKeyId,
          secretAccessKey: config.syncS3.secretAccessKey,
        },
        forcePathStyle: config.syncS3.forcePathStyle,
      });
    }
    return this.s3Client;
  }

  /**
   * Check which blobs exist in a vault
   * Returns a map of blobHash -> exists
   */
  async hasBlobs(
    userId: string,
    vaultId: string,
    blobHashes: string[]
  ): Promise<Map<string, boolean>> {
    // Assert vault ownership first
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();
    const result = await db
      .select({ blobHash: blobs.blobHash })
      .from(blobs)
      .where(
        and(
          eq(blobs.vaultId, vaultId),
          inArray(blobs.blobHash, blobHashes)
        )
      );

    const existsSet = new Set(result.map((row) => row.blobHash));
    const response = new Map<string, boolean>();

    for (const hash of blobHashes) {
      response.set(hash, existsSet.has(hash));
    }

    logger.debug('hasBlobs checked', { vaultId, total: blobHashes.length, found: result.length });

    return response;
  }

  /**
   * Generate a presigned URL for uploading a blob
   * Records blob metadata with refCount = 1 if not already exists
   */
  async createBlobUploadUrl(
    userId: string,
    vaultId: string,
    blobHash: string,
    sizeBytes: number,
    mimeType: string
  ): Promise<{ uploadUrl: string; storageKey: string }> {
    // Assert vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const config = getConfig();
    const storageKey = generateStorageKey(userId, vaultId, blobHash);

    // Validate size
    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size ${sizeBytes} exceeds maximum allowed size ${MAX_FILE_SIZE_BYTES}`);
    }

    const db = getDb();
    const existing = await db
      .select()
      .from(blobs)
      .where(and(eq(blobs.vaultId, vaultId), eq(blobs.blobHash, blobHash)))
      .limit(1);

    if (existing.length === 0) {
      // Create blob metadata record with refCount = 1
      const now = new Date();
      const blobId = generateId();

      const newBlob: NewBlob = {
        id: blobId,
        vaultId,
        blobHash,
        storageKey,
        sizeBytes,
        mimeType: mimeType ?? null,
        refCount: 1,
        createdByUserId: userId,
        createdAt: now,
      };

      // Use onDuplicateKeyUpdate to avoid race condition when two requests
      // try to insert the same blob simultaneously
      await db.insert(blobs).values(newBlob).onDuplicateKeyUpdate({
        set: { id: sql`id` }, // No-op update that still succeeds
      });

      logger.info('Blob metadata created', { blobId, vaultId, blobHash, sizeBytes });
    }

    // Generate presigned PUT URL
    const s3Client = this.getS3Client();
    const command = new PutObjectCommand({
      Bucket: config.syncS3.bucket,
      Key: storageKey,
      ContentLength: sizeBytes,
      ContentType: mimeType,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploadUrl = await getSignedUrl(s3Client as any, command, {
      expiresIn: config.syncS3.presignedUrlExpirySeconds,
    });

    logger.debug('Presigned upload URL generated', { vaultId, blobHash, sizeBytes });

    return { uploadUrl, storageKey };
  }

  /**
   * Generate a presigned URL for downloading a blob
   */
  async createBlobDownloadUrl(
    userId: string,
    vaultId: string,
    blobHash: string
  ): Promise<{ downloadUrl: string; metadata: BlobMetadata }> {
    // Assert vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();

    // Find the blob record
    const result = await db
      .select()
      .from(blobs)
      .where(and(eq(blobs.vaultId, vaultId), eq(blobs.blobHash, blobHash)))
      .limit(1);

    if (result.length === 0) {
      throw new BlobNotFoundError(blobHash, vaultId);
    }

    const blob = result[0];

    // Generate presigned GET URL
    const config = getConfig();
    const s3Client = this.getS3Client();
    const command = new GetObjectCommand({
      Bucket: config.syncS3.bucket,
      Key: blob.storageKey,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downloadUrl = await getSignedUrl(s3Client as any, command, {
      expiresIn: config.syncS3.presignedUrlExpirySeconds,
    });

    logger.debug('Presigned download URL generated', { vaultId, blobHash });

    return {
      downloadUrl,
      metadata: {
        blobHash: blob.blobHash,
        sizeBytes: blob.sizeBytes,
        mimeType: blob.mimeType,
        storageKey: blob.storageKey,
        refCount: blob.refCount,
        createdAt: blob.createdAt,
      },
    };
  }

  /**
   * Increment refCount for a blob (e.g., when another file references it)
   */
  async incrementRefCount(userId: string, vaultId: string, blobHash: string): Promise<void> {
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();

    await db
      .update(blobs)
      .set({ refCount: sql`${blobs.refCount} + 1` })
      .where(and(eq(blobs.vaultId, vaultId), eq(blobs.blobHash, blobHash)));

    logger.debug('Blob refCount incremented', { vaultId, blobHash });
  }

  /**
   * Decrement refCount for a blob (e.g., when a file reference is removed)
   * Does not delete the blob even if refCount reaches 0
   */
  async decrementRefCount(userId: string, vaultId: string, blobHash: string): Promise<void> {
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();

    await db
      .update(blobs)
      .set({ refCount: sql`CASE WHEN ${blobs.refCount} > 0 THEN ${blobs.refCount} - 1 ELSE 0 END` })
      .where(and(eq(blobs.vaultId, vaultId), eq(blobs.blobHash, blobHash)));

    logger.debug('Blob refCount decremented', { vaultId, blobHash });
  }

  /**
   * Get blob metadata by hash
   */
  async getBlobMetadata(
    userId: string,
    vaultId: string,
    blobHash: string
  ): Promise<BlobMetadata | null> {
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();
    const result = await db
      .select()
      .from(blobs)
      .where(and(eq(blobs.vaultId, vaultId), eq(blobs.blobHash, blobHash)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const blob = result[0];
    return {
      blobHash: blob.blobHash,
      sizeBytes: blob.sizeBytes,
      mimeType: blob.mimeType,
      storageKey: blob.storageKey,
      refCount: blob.refCount,
      createdAt: blob.createdAt,
    };
  }
}
