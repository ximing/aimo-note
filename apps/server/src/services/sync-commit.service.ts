import { Service } from 'typedi';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import {
  syncCommits,
  type NewSyncCommit,
} from '../db/schema/sync-commits.js';
import {
  syncCommitChanges,
  type NewSyncCommitChange,
} from '../db/schema/sync-commit-changes.js';
import {
  syncFileHeads,
  type NewSyncFileHead,
} from '../db/schema/sync-file-heads.js';
import {
  syncConflicts,
  type NewSyncConflict,
} from '../db/schema/sync-conflicts.js';
import { blobs } from '../db/schema/blobs.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { VaultService } from './vault.service.js';
import { DeviceService } from './device.service.js';
import { AuditService } from './audit.service.js';

/**
 * Error thrown when a path is rejected because it starts with .aimo-note/
 */
export class InvalidFilePathError extends Error {
  code = ErrorCodes.VALIDATION_ERROR;
  constructor(filePath: string) {
    super(`File path cannot start with .aimo-note/: ${filePath}`);
    this.name = 'InvalidFilePathError';
  }
}

/**
 * Error thrown when a blob hash is not found in the blobs table
 */
export class BlobNotFoundError extends Error {
  code = ErrorCodes.RESOURCE_NOT_FOUND;
  constructor(blobHash: string) {
    super(`Blob not found: ${blobHash}`);
    this.name = 'BlobNotFoundError';
  }
}

/**
 * Error thrown when a sync conflict is detected
 */
export class SyncConflictError extends Error {
  code = ErrorCodes.SYNC_CONFLICT;
  constructor(
    public readonly conflicts: Array<{
      filePath: string;
      baseRevision: string;
      headRevision: string;
      winningCommitSeq: number;
    }>
  ) {
    super(`Sync conflict detected for ${conflicts.length} file(s)`);
    this.name = 'SyncConflictError';
  }
}

/**
 * Error thrown when a duplicate requestId is detected (idempotency check)
 */
export class DuplicateRequestIdError extends Error {
  code = ErrorCodes.RESOURCE_ALREADY_EXISTS;
  constructor(vaultId: string, requestId: string) {
    super(`Duplicate requestId: ${requestId} for vault ${vaultId}`);
    this.name = 'DuplicateRequestIdError';
  }
}

/**
 * Request body for a sync commit
 */
export interface SyncCommitRequest {
  vaultId: string;
  deviceId: string;
  requestId: string;
  baseSeq: number | null;
  summary?: string;
  changes: Array<{
    filePath: string;
    op: 'upsert' | 'delete';
    blobHash: string | null;
    baseRevision: string | null;
    newRevision: string;
    sizeBytes: number | null;
    metadataJson: string | null;
  }>;
}

/**
 * Result of a successful sync commit
 */
export interface SyncCommitResult {
  commitSeq: number;
  appliedChanges: number;
}

/**
 * Service for handling sync commit operations.
 * Manages the commit workflow including validation, conflict detection,
 * transaction handling, and audit logging.
 */
@Service()
export class SyncCommitService {
  constructor(
    private readonly vaultService: VaultService,
    private readonly deviceService: DeviceService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Process a sync commit request.
   *
   * Steps:
   * 1. Validate vault ownership
   * 2. Validate device ownership
   * 3. Check for duplicate requestId (idempotency)
   * 4. Validate all file paths don't start with .aimo-note/
   * 5. Validate all blobHash references exist in blobs table
   * 6. Begin transaction
   * 7. For each change, check sync_file_heads baseRevision
   * 8. If any conflict, write sync_conflicts and fail
   * 9. Write sync_commits
   * 10. Write sync_commit_changes
   * 11. Upsert sync_file_heads
   * 12. Update blobs.refCount
   * 13. Commit transaction
   * 14. Return commitSeq + appliedChanges
   */
  async commit(
    userId: string,
    request: SyncCommitRequest
  ): Promise<SyncCommitResult> {
    const { vaultId, deviceId, requestId, baseSeq, summary, changes } = request;

    logger.info('SyncCommitService.commit started', {
      userId,
      vaultId,
      deviceId,
      requestId,
      changeCount: changes.length,
    });

    // Step 1: Validate vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    // Step 2: Validate device ownership
    await this.deviceService.assertDeviceOwnership(userId, deviceId);

    // Step 3: Check for duplicate requestId (idempotency) - moved inside transaction
    // Step 4: Validate file paths
    this.validateFilePaths(changes);

    // Step 5: Validate blob hashes exist
    await this.validateBlobHashes(vaultId, changes);

    // Sort changes by filePath to prevent deadlock
    const sortedChanges = changes.slice().sort((a, b) => a.filePath.localeCompare(b.filePath));

    // Step 6-13: Execute within transaction
    const result = await withTransaction(getDb(), async (tx) => {
      // Step 3 (inside transaction): Check for duplicate requestId with FOR UPDATE lock
      const existing = await tx
        .select()
        .from(syncCommits)
        .where(
          and(
            eq(syncCommits.vaultId, vaultId),
            eq(syncCommits.requestId, requestId)
          )
        )
        .limit(1)
        .forUpdate();

      if (existing.length > 0) {
        throw new DuplicateRequestIdError(vaultId, requestId);
      }

      // Step 7: Check baseRevision against sync_file_heads for each change (sorted)
      const conflicts = await this.checkConflicts(tx, vaultId, sortedChanges);

      if (conflicts.length > 0) {
        // Step 8: Write sync_conflicts and fail
        await this.writeConflicts(tx, userId, vaultId, conflicts);

        // Audit log for failure
        await this.auditService.logSyncCommit(userId, vaultId, deviceId, requestId, {
          status: 'conflict',
          detail: { conflictCount: conflicts.length },
        });

        throw new SyncConflictError(conflicts);
      }

      // Step 9: Write sync_commits
      const now = new Date();
      const commitId = generateId();
      const commitSeq = await this.writeSyncCommit(tx, {
        id: commitId,
        vaultId,
        userId,
        deviceId,
        requestId,
        baseSeq,
        summary,
        changeCount: changes.length,
        createdAt: now,
      });

      // Step 10: Write sync_commit_changes
      await this.writeSyncCommitChanges(tx, vaultId, commitSeq, changes, now);

      // Step 11: Upsert sync_file_heads (need old blob hashes for refCount updates)
      const oldBlobHashes = await this.getOldBlobHashes(tx, vaultId, changes);
      await this.upsertSyncFileHeads(tx, vaultId, changes, commitSeq, now);

      // Step 12: Update blobs.refCount (decrement old blobs, increment new blobs)
      await this.updateBlobRefCounts(tx, vaultId, changes, oldBlobHashes);

      return { commitSeq, appliedChanges: changes.length };
    });

    // Step 14: Audit log for success
    await this.auditService.logSyncCommit(userId, vaultId, deviceId, requestId, {
      status: 'success',
      detail: { commitSeq: result.commitSeq, appliedChanges: result.appliedChanges },
    });

    logger.info('SyncCommitService.commit completed', {
      userId,
      vaultId,
      deviceId,
      requestId,
      commitSeq: result.commitSeq,
      appliedChanges: result.appliedChanges,
    });

    return result;
  }

  /**
   * Validate that all file paths don't start with .aimo-note/
   */
  private validateFilePaths(
    changes: Array<{ filePath: string; op: 'upsert' | 'delete' }>
  ): void {
    const invalidPaths = changes.filter((c) => c.filePath.startsWith('.aimo-note/'));

    if (invalidPaths.length > 0) {
      throw new InvalidFilePathError(invalidPaths[0].filePath);
    }
  }

  /**
   * Validate that all blobHash references exist in blobs table
   */
  private async validateBlobHashes(
    vaultId: string,
    changes: Array<{ blobHash: string | null; op: 'upsert' | 'delete' }>
  ): Promise<void> {
    // Only check blobHash for upsert operations
    const blobHashes = changes
      .filter((c) => c.op === 'upsert' && c.blobHash)
      .map((c) => c.blobHash as string);

    if (blobHashes.length === 0) {
      return;
    }

    const db = getDb();
    const existing = await db
      .select({ blobHash: blobs.blobHash })
      .from(blobs)
      .where(
        and(
          eq(blobs.vaultId, vaultId),
          inArray(blobs.blobHash, blobHashes)
        )
      );

    const existingSet = new Set(existing.map((e) => e.blobHash));
    const missing = blobHashes.filter((h) => !existingSet.has(h));

    if (missing.length > 0) {
      throw new BlobNotFoundError(missing[0]);
    }
  }

  /**
   * Check for conflicts by comparing baseRevision against sync_file_heads
   * Returns array of conflicts if any are found
   */
  private async checkConflicts(
    tx: any,
    vaultId: string,
    changes: Array<{ filePath: string; baseRevision: string | null }>
  ): Promise<Array<{
    filePath: string;
    baseRevision: string;
    headRevision: string;
    winningCommitSeq: number;
  }>> {
    const conflicts: Array<{
      filePath: string;
      baseRevision: string;
      headRevision: string;
      winningCommitSeq: number;
    }> = [];

    for (const change of changes) {
      if (change.baseRevision === null) {
        // No base revision means no conflict possible
        continue;
      }

      // Look up current head for this file with row lock to prevent concurrent writes
      const heads = await tx
        .select()
        .from(syncFileHeads)
        .where(
          and(
            eq(syncFileHeads.vaultId, vaultId),
            eq(syncFileHeads.filePath, change.filePath)
          )
        )
        .limit(1)
        .forUpdate();

      if (heads.length === 0) {
        // No head exists - this is a new file, no conflict
        continue;
      }

      const head = heads[0];

      // Check if the base revision matches the current head
      if (head.headRevision !== change.baseRevision) {
        // Conflict detected
        conflicts.push({
          filePath: change.filePath,
          baseRevision: change.baseRevision,
          headRevision: head.headRevision,
          winningCommitSeq: Number(head.lastCommitSeq),
        });
      }
    }

    return conflicts;
  }

  /**
   * Write conflict records to the sync_conflicts table
   */
  private async writeConflicts(
    tx: any,
    userId: string,
    vaultId: string,
    conflicts: Array<{
      filePath: string;
      baseRevision: string;
      headRevision: string;
      winningCommitSeq: number;
    }>
  ): Promise<void> {
    for (const conflict of conflicts) {
      const conflictId = generateId();
      const newConflict: NewSyncConflict = {
        id: conflictId,
        vaultId,
        userId,
        filePath: conflict.filePath,
        losingDeviceId: null,
        winningRevision: conflict.headRevision,
        losingRevision: conflict.baseRevision,
        winningCommitSeq: conflict.winningCommitSeq,
        resolvedAt: null,
        createdAt: new Date(),
      };

      await tx.insert(syncConflicts).values(newConflict);
    }
  }

  /**
   * Write a new sync_commit record
   * Returns the commit sequence number
   */
  private async writeSyncCommit(
    tx: any,
    commit: Omit<NewSyncCommit, 'seq'>
  ): Promise<number> {
    await tx.insert(syncCommits).values(commit);

    // Get the auto-incremented seq
    const result = await tx
      .select({ seq: syncCommits.seq })
      .from(syncCommits)
      .where(eq(syncCommits.id, commit.id))
      .limit(1);

    return Number(result[0].seq);
  }

  /**
   * Write sync_commit_changes records for all changes
   */
  private async writeSyncCommitChanges(
    tx: any,
    vaultId: string,
    commitSeq: number,
    changes: SyncCommitRequest['changes'],
    now: Date
  ): Promise<void> {
    for (const change of changes) {
      const newChange: NewSyncCommitChange = {
        commitSeq: commitSeq,
        vaultId,
        filePath: change.filePath,
        op: change.op,
        blobHash: change.blobHash,
        baseRevision: change.baseRevision,
        newRevision: change.newRevision,
        sizeBytes: change.sizeBytes,
        metadataJson: change.metadataJson,
        createdAt: now,
      };

      await tx.insert(syncCommitChanges).values(newChange);
    }
  }

  /**
   * Upsert sync_file_heads records for all changes
   * Uses ON DUPLICATE KEY UPDATE via onDuplicateKeyUpdate
   */
  private async upsertSyncFileHeads(
    tx: any,
    vaultId: string,
    changes: SyncCommitRequest['changes'],
    commitSeq: number,
    now: Date
  ): Promise<void> {
    for (const change of changes) {
      const id = generateId();
      const headRevision = change.newRevision;
      const blobHash = change.blobHash;
      const isDeleted = change.op === 'delete' ? '1' : '0';

      // Use ON DUPLICATE KEY UPDATE via insert with onDuplicateKeyUpdate
      const newHead: NewSyncFileHead = {
        id,
        vaultId,
        filePath: change.filePath,
        headRevision,
        blobHash,
        lastCommitSeq: commitSeq,
        isDeleted,
        updatedAt: now,
      };

      await tx
        .insert(syncFileHeads)
        .values(newHead)
        .onDuplicateKeyUpdate({
          set: {
            headRevision,
            blobHash,
            lastCommitSeq: commitSeq,
            isDeleted,
            updatedAt: now,
          },
        });
    }
  }

  /**
   * Get the current blob hashes from sync_file_heads before they are updated.
   * Used to determine which blobs need refCount decremented when files are deleted/replaced.
   */
  private async getOldBlobHashes(
    tx: any,
    vaultId: string,
    changes: SyncCommitRequest['changes']
  ): Promise<Map<string, string | null>> {
    const oldBlobHashes = new Map<string, string | null>();

    for (const change of changes) {
      // For delete operations, we need the current blob to decrement its refCount
      // For upsert operations, we also need the old blob if this file already exists
      // (i.e., an upsert that replaces an existing file's blob)
      if (change.op === 'delete' || change.op === 'upsert') {
        const heads = await tx
          .select({ blobHash: syncFileHeads.blobHash })
          .from(syncFileHeads)
          .where(
            and(
              eq(syncFileHeads.vaultId, vaultId),
              eq(syncFileHeads.filePath, change.filePath)
            )
          )
          .limit(1);

        // Only set if there was a previous blob (to decrement its refCount)
        if (heads.length > 0 && heads[0].blobHash) {
          oldBlobHashes.set(change.filePath, heads[0].blobHash);
        }
      }
    }

    return oldBlobHashes;
  }

  /**
   * Update blobs.refCount for affected blob hashes.
   * - For upsert: increments refCount for the new blob
   * - For delete: decrements refCount for the old blob (passed via oldBlobHashes)
   *
   * Note: refCount update (Step 12) is executed inside the transaction.
   * Audit logging (Step 14) is intentionally outside the transaction.
   * If audit logging fails, the commit is already persisted. This is best-effort
   * audit - we accept potential inconsistency rather than risking commit failure.
   */
  private async updateBlobRefCounts(
    tx: any,
    vaultId: string,
    changes: SyncCommitRequest['changes'],
    oldBlobHashes: Map<string, string | null>
  ): Promise<void> {
    // Calculate refCount deltas: positive for increments, negative for decrements
    const blobRefDeltas = new Map<string, number>();

    for (const change of changes) {
      if (change.op === 'upsert' && change.blobHash) {
        // New blob gets +1
        const delta = blobRefDeltas.get(change.blobHash) || 0;
        blobRefDeltas.set(change.blobHash, delta + 1);

        // If this upsert replaces an existing file's blob, decrement the old blob
        const oldBlobHash = oldBlobHashes.get(change.filePath);
        if (oldBlobHash && oldBlobHash !== change.blobHash) {
          const oldDelta = blobRefDeltas.get(oldBlobHash) || 0;
          blobRefDeltas.set(oldBlobHash, oldDelta - 1);
        }
      } else if (change.op === 'delete') {
        // Old blob gets -1 (if it existed and had a blobHash)
        const oldBlobHash = oldBlobHashes.get(change.filePath);
        if (oldBlobHash) {
          const delta = blobRefDeltas.get(oldBlobHash) || 0;
          blobRefDeltas.set(oldBlobHash, delta - 1);
        }
      }
    }

    // Apply refCount updates using SQL template for atomic increment/decrement
    for (const [blobHash, delta] of blobRefDeltas.entries()) {
      await tx
        .update(blobs)
        .set({ refCount: sql`GREATEST(0, ${blobs.refCount} + ${delta})` })
        .where(
          and(
            eq(blobs.vaultId, vaultId),
            eq(blobs.blobHash, blobHash)
          )
        );
    }
  }
}
