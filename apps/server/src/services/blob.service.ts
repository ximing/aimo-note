import { Service } from 'typedi';
import { eq, and, inArray, sql, lt } from 'drizzle-orm';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getDb } from '../db/connection.js';
import { blobs, type NewBlob } from '../db/schema/blobs.js';
import { syncFileHeads } from '../db/schema/sync-file-heads.js';
import { syncCommitChanges } from '../db/schema/sync-commit-changes.js';
import { syncTombstones } from '../db/schema/sync-tombstones.js';
import { snapshots } from '../db/schema/snapshots.js';
import { syncDeviceCursors } from '../db/schema/sync-device-cursors.js';
import { syncAuditLogs, type NewSyncAuditLog } from '../db/schema/sync-audit-logs.js';
import { devices } from '../db/schema/devices.js';
import { getConfig } from '../config/config.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { VaultService } from './vault.service.js';
import { DeviceService } from './device.service.js';
import type { TombstoneRetentionConfig, TombstoneCleanupResult } from '@aimo-note/dto';

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

  constructor(
    private readonly vaultService: VaultService,
    private readonly deviceService: DeviceService
  ) {}

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
    deviceId: string,
    blobHashes: string[]
  ): Promise<Map<string, boolean>> {
    // Assert vault ownership and device-vault binding
    await this.vaultService.assertVaultOwnership(userId, vaultId);
    await this.deviceService.assertDeviceOwnership(userId, vaultId, deviceId);

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
   * Records blob metadata with refCount = 0 if not already exists (refCount driven by commit transaction)
   */
  async createBlobUploadUrl(
    userId: string,
    vaultId: string,
    deviceId: string,
    blobHash: string,
    sizeBytes: number,
    mimeType: string
  ): Promise<{ uploadUrl: string; storageKey: string; blobHash: string; expiresIn: number; headers: Record<string, string> }> {
    // Assert vault ownership and device-vault binding
    await this.vaultService.assertVaultOwnership(userId, vaultId);
    await this.deviceService.assertDeviceOwnership(userId, vaultId, deviceId);

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
        refCount: 0,
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

    return {
      uploadUrl,
      storageKey,
      blobHash,
      expiresIn: config.syncS3.presignedUrlExpirySeconds,
      headers: { 'Content-Type': mimeType },
    };
  }

  /**
   * Generate a presigned URL for downloading a blob
   */
  async createBlobDownloadUrl(
    userId: string,
    vaultId: string,
    deviceId: string,
    blobHash: string
  ): Promise<{ downloadUrl: string; metadata: BlobMetadata }> {
    // Assert vault ownership and device-vault binding
    await this.vaultService.assertVaultOwnership(userId, vaultId);
    await this.deviceService.assertDeviceOwnership(userId, vaultId, deviceId);

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

  // ============================================================================
  // Cleanup Methods
  // ============================================================================

  /**
   * Clean up orphan blobs - blobs with ref_count=0 that are beyond the safe retention window.
   * ref_count=0 is ONLY a candidate filter, NOT sole deletion criteria.
   * Must re-verify actual references before deletion.
   */
  async cleanupOrphanBlobs(
    vaultId: string,
    retentionDays: number
  ): Promise<{ deletedCount: number; errors: string[] }> {
    const db = getDb();
    const errors: string[] = [];
    let deletedCount = 0;

    logger.info('BlobService.cleanupOrphanBlobs started', { vaultId, retentionDays });

    // Calculate retention cutoff date
    const retentionCutoff = new Date();
    retentionCutoff.setDate(retentionCutoff.getDate() - retentionDays);

    try {
      // Step 1: Find candidate blobs (ref_count=0 and created before retention cutoff)
      const candidateBlobs = await db
        .select()
        .from(blobs)
        .where(
          and(
            eq(blobs.vaultId, vaultId),
            eq(blobs.refCount, 0),
            lt(blobs.createdAt, retentionCutoff)
          )
        );

      logger.debug('BlobService.cleanupOrphanBlobs candidates', {
        vaultId,
        candidateCount: candidateBlobs.length,
      });

      for (const blob of candidateBlobs) {
        try {
          // Step 2: Re-verify actual references from multiple sources
          const isReferenced = await this.isBlobActuallyReferenced(vaultId, blob.blobHash);

          if (isReferenced) {
            // Blob is actually referenced - log warning and skip
            logger.warn('BlobService.cleanupOrphanBlobs skipping referenced blob', {
              vaultId,
              blobHash: blob.blobHash,
              storedRefCount: blob.refCount,
            });
            continue;
          }

          // Step 3: Verify ref_count matches reality - log warning if diverged
          if (blob.refCount !== 0) {
            logger.warn('BlobService.cleanupOrphanBlobs ref_count mismatch', {
              vaultId,
              blobHash: blob.blobHash,
              storedRefCount: blob.refCount,
            });
          }

          // Step 4: Delete blob from S3 first (if fails, skip MySQL delete so retry is possible)
          try {
            await this.deleteBlobFromStorage(blob.storageKey);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error('BlobService.cleanupOrphanBlobs S3 delete failed, skipping MySQL delete', {
              vaultId,
              blobHash: blob.blobHash,
              storageKey: blob.storageKey,
              error: errorMsg,
            });
            continue;
          }

          // Step 5: Delete blob metadata record from MySQL
          await db.delete(blobs).where(eq(blobs.id, blob.id));

          // Step 6: Write audit log
          await this.writeAuditLog({
            vaultId,
            action: 'BLOB_DELETE_ORPHAN',
            status: 'success',
            detailJson: JSON.stringify({
              blobHash: blob.blobHash,
              storageKey: blob.storageKey,
              sizeBytes: blob.sizeBytes,
              retentionDays,
              createdAt: blob.createdAt.toISOString(),
            }),
          });

          deletedCount++;
          logger.debug('BlobService.cleanupOrphanBlobs deleted blob', {
            vaultId,
            blobHash: blob.blobHash,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to delete blob ${blob.blobHash}: ${errorMsg}`);
          logger.error('BlobService.cleanupOrphanBlobs failed to delete blob', {
            vaultId,
            blobHash: blob.blobHash,
            error: errorMsg,
          });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Cleanup failed: ${errorMsg}`);
      logger.error('BlobService.cleanupOrphanBlobs failed', { vaultId, error: errorMsg });
    }

    logger.info('BlobService.cleanupOrphanBlobs completed', {
      vaultId,
      deletedCount,
      errorCount: errors.length,
    });

    return { deletedCount, errors };
  }

  /**
   * Clean up tombstones that have exceeded the retention period.
   * Safety conditions:
   * 1. Tombstone age exceeds retention window
   * 2. ALL non-revoked devices' lastPulledSeq have passed the delete commit
   * 3. Blob is not referenced by any current head, history revision, or snapshot
   */
  async cleanupTombstones(
    vaultId: string,
    config: TombstoneRetentionConfig
  ): Promise<TombstoneCleanupResult> {
    const db = getDb();
    const errors: string[] = [];
    let deletedCount = 0;
    const now = new Date();

    logger.info('BlobService.cleanupTombstones started', { vaultId, config });

    try {
      // Step 1: Calculate retention cutoff
      const retentionCutoff = new Date();
      retentionCutoff.setDate(retentionCutoff.getDate() - config.retentionDays);

      // Step 2: Get candidate tombstones (older than retention window)
      const candidateTombstones = await db
        .select()
        .from(syncTombstones)
        .where(
          and(
            eq(syncTombstones.vaultId, vaultId),
            lt(syncTombstones.createdAt, retentionCutoff)
          )
        );

      logger.debug('BlobService.cleanupTombstones candidates', {
        vaultId,
        candidateCount: candidateTombstones.length,
      });

      // Step 3: Get all non-revoked devices and their lastPulledSeq
      const nonRevokedDevices = await db
        .select({
          deviceId: devices.id,
          lastPulledSeq: syncDeviceCursors.lastPulledSeq,
        })
        .from(devices)
        .leftJoin(
          syncDeviceCursors,
          and(
            eq(syncDeviceCursors.vaultId, vaultId),
            eq(syncDeviceCursors.deviceId, devices.id)
          )
        )
        .where(
          and(
            eq(devices.vaultId, vaultId),
            sql`${devices.revokedAt} IS NULL`
          )
        );

      for (const tombstone of candidateTombstones) {
        try {
          // Safety check 1: Verify ALL non-revoked devices have pulled past the delete commit
          const allDevicesPulled = nonRevokedDevices.every((device) => {
            const lastPulled = device.lastPulledSeq ?? 0;
            return lastPulled >= Number(tombstone.deleteCommitSeq);
          });

          if (!allDevicesPulled) {
            logger.debug('BlobService.cleanupTombstones skipping - not all devices have pulled', {
              vaultId,
              filePath: tombstone.filePath,
              deleteCommitSeq: tombstone.deleteCommitSeq,
            });
            continue;
          }

          // Safety check 2: Verify blob is not referenced by any current head
          const blobHash = await this.getBlobHashForDeletedFile(vaultId, tombstone.filePath);
          if (blobHash) {
            const isReferenced = await this.isBlobActuallyReferenced(vaultId, blobHash);
            if (isReferenced) {
              logger.debug('BlobService.cleanupTombstones skipping - blob still referenced', {
                vaultId,
                filePath: tombstone.filePath,
                blobHash,
              });
              continue;
            }
          }

          // Safety check 3: Verify no history revision references this file with a blob
          const hasHistoryReference = await this.hasHistoryReference(vaultId, tombstone.filePath);
          if (hasHistoryReference) {
            logger.debug('BlobService.cleanupTombstones skipping - has history reference', {
              vaultId,
              filePath: tombstone.filePath,
            });
            continue;
          }

          // Safety check 4: Verify no snapshot references this file
          const hasSnapshotReference = await this.hasSnapshotReference(vaultId, tombstone.deleteCommitSeq);
          if (hasSnapshotReference) {
            logger.debug('BlobService.cleanupTombstones skipping - has snapshot reference', {
              vaultId,
              filePath: tombstone.filePath,
              deleteCommitSeq: tombstone.deleteCommitSeq,
            });
            continue;
          }

          // All safety checks passed - delete the tombstone
          await db.delete(syncTombstones).where(eq(syncTombstones.id, tombstone.id));

          // Write audit log
          await this.writeAuditLog({
            vaultId,
            action: 'TOMBSTONE_DELETE',
            status: 'success',
            detailJson: JSON.stringify({
              tombstoneId: tombstone.id,
              filePath: tombstone.filePath,
              deleteCommitSeq: tombstone.deleteCommitSeq,
              tombstoneAge: now.getTime() - tombstone.createdAt.getTime(),
            }),
          });

          deletedCount++;
          logger.debug('BlobService.cleanupTombstones deleted tombstone', {
            vaultId,
            filePath: tombstone.filePath,
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`Failed to delete tombstone for ${tombstone.filePath}: ${errorMsg}`);
          logger.error('BlobService.cleanupTombstones failed to delete tombstone', {
            vaultId,
            filePath: tombstone.filePath,
            error: errorMsg,
          });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Tombstone cleanup failed: ${errorMsg}`);
      logger.error('BlobService.cleanupTombstones failed', { vaultId, error: errorMsg });
    }

    logger.info('BlobService.cleanupTombstones completed', {
      vaultId,
      deletedCount,
      errorCount: errors.length,
    });

    return {
      deletedCount,
      errors,
      cleanedAt: now.toISOString(),
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Check if a blob is actually referenced by sync_file_heads, history, or snapshots
   */
  private async isBlobActuallyReferenced(vaultId: string, blobHash: string): Promise<boolean> {
    const db = getDb();

    // Check 1: sync_file_heads (current heads)
    const headReference = await db
      .select({ id: syncFileHeads.id })
      .from(syncFileHeads)
      .where(
        and(
          eq(syncFileHeads.vaultId, vaultId),
          eq(syncFileHeads.blobHash, blobHash)
        )
      )
      .limit(1);

    if (headReference.length > 0) {
      return true;
    }

    // Check 2: sync_commit_changes (history revisions)
    const historyReference = await db
      .select({ id: syncCommitChanges.id })
      .from(syncCommitChanges)
      .where(
        and(
          eq(syncCommitChanges.vaultId, vaultId),
          eq(syncCommitChanges.blobHash, blobHash)
        )
      )
      .limit(1);

    if (historyReference.length > 0) {
      return true;
    }

    // Check 3: snapshots (snapshots may reference blobs)
    // Snapshots reference blobs indirectly through file state, check via commit changes
    const snapshotReference = await db
      .select({ id: snapshots.id })
      .from(snapshots)
      .innerJoin(syncCommitChanges, eq(snapshots.baseSeq, syncCommitChanges.commitSeq))
      .where(
        and(
          eq(snapshots.vaultId, vaultId),
          eq(syncCommitChanges.blobHash, blobHash)
        )
      )
      .limit(1);

    return snapshotReference.length > 0;
  }

  /**
   * Get the blob hash for a deleted file at a specific commit
   */
  private async getBlobHashForDeletedFile(vaultId: string, filePath: string): Promise<string | null> {
    const db = getDb();

    // Find the delete commit to get the blob hash that was deleted
    const result = await db
      .select({ blobHash: syncCommitChanges.blobHash })
      .from(syncCommitChanges)
      .where(
        and(
          eq(syncCommitChanges.vaultId, vaultId),
          eq(syncCommitChanges.filePath, filePath),
          eq(syncCommitChanges.op, 'delete')
        )
      )
      .orderBy(syncCommitChanges.commitSeq)
      .limit(1);

    return result.length > 0 && result[0].blobHash ? result[0].blobHash : null;
  }

  /**
   * Check if a file has any history references (non-deleted commits with blobs)
   */
  private async hasHistoryReference(vaultId: string, filePath: string): Promise<boolean> {
    const db = getDb();

    const result = await db
      .select({ id: syncCommitChanges.id })
      .from(syncCommitChanges)
      .where(
        and(
          eq(syncCommitChanges.vaultId, vaultId),
          eq(syncCommitChanges.filePath, filePath),
          eq(syncCommitChanges.op, 'upsert'),
          sql`${syncCommitChanges.blobHash} IS NOT NULL`
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Check if any snapshot references state at or before the given commit seq
   */
  private async hasSnapshotReference(vaultId: string, commitSeq: number): Promise<boolean> {
    const db = getDb();

    const result = await db
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(
        and(
          eq(snapshots.vaultId, vaultId),
          sql`${snapshots.baseSeq} <= ${commitSeq}`,
          sql`${snapshots.status} IN ('pending', 'running', 'succeeded')`
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Delete blob from S3 storage
   */
  private async deleteBlobFromStorage(storageKey: string): Promise<void> {
    const config = getConfig();
    const s3Client = this.getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: config.syncS3.bucket,
      Key: storageKey,
    });
    await s3Client.send(command);
    logger.debug('Blob deleted from S3', { storageKey });
  }

  /**
   * Write audit log for cleanup operations
   */
  private async writeAuditLog(params: {
    vaultId: string;
    action: string;
    status: string;
    detailJson?: string;
    deviceId?: string;
    userId?: string;
  }): Promise<void> {
    const db = getDb();
    const now = new Date();

    const auditLog: NewSyncAuditLog = {
      userId: params.userId ?? null,
      vaultId: params.vaultId,
      deviceId: params.deviceId ?? null,
      action: params.action,
      requestId: null,
      status: params.status,
      detailJson: params.detailJson ?? null,
      createdAt: now,
    };

    await db.insert(syncAuditLogs).values(auditLog);
  }
}
