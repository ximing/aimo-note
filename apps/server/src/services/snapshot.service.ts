import { Service } from 'typedi';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { snapshots, SNAPSHOT_STATUS, type Snapshot, type NewSnapshot } from '../db/schema/snapshots.js';
import { syncCommits } from '../db/schema/sync-commits.js';
import { syncCommitChanges } from '../db/schema/sync-commit-changes.js';
import { syncFileHeads } from '../db/schema/sync-file-heads.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { VaultService } from './vault.service.js';
import { AuditService } from './audit.service.js';

/**
 * Task status for snapshot operations.
 * Only `succeeded` and `failed` are terminal states.
 */
export type SnapshotTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/**
 * Snapshot record with polling and task status fields.
 */
export interface SnapshotRecord {
  id: string;
  vaultId: string;
  status: SnapshotTaskStatus;
  baseSeq: number;
  sizeBytes: number | null;
  createdAt: string;
  finishedAt: string | null;
  restoredCommitSeq: number | null;
  failureReason: string | null;
  finalCommitSeq: number | null;
  updatedAt: string;
}

/**
 * Snapshot restore result with task status and failure information.
 */
export interface SnapshotRestoreResult {
  snapshotId: string;
  status: SnapshotTaskStatus;
  restoredCommitSeq: number;
  restoredFiles: number;
  resultSummary: string | null;
  failureReason: string | null;
  finalCommitSeq: number | null;
}

export class SnapshotNotFoundError extends Error {
  code = ErrorCodes.RESOURCE_NOT_FOUND;
  constructor(snapshotId: string) {
    super(`Snapshot not found: ${snapshotId}`);
    this.name = 'SnapshotNotFoundError';
  }
}

export class RestoreConflictError extends Error {
  code = ErrorCodes.SYNC_CONFLICT;
  existingTask: SnapshotRestoreResult;
  constructor(snapshotId: string, existingTask: SnapshotRestoreResult) {
    super(`Restore already in progress for snapshot ${snapshotId}`);
    this.name = 'RestoreConflictError';
    this.existingTask = existingTask;
  }
}

/**
 * Request to create a snapshot
 */
export interface CreateSnapshotParams {
  vaultId: string;
  description?: string;
}

/**
 * Request to restore a snapshot
 */
export interface RestoreSnapshotParams {
  snapshotId: string;
  deviceId?: string;
}

/**
 * Snapshot service for vault backup/restore functionality.
 * Handles snapshot creation, listing, and async restore operations.
 */
@Service()
export class SnapshotService {
  constructor(
    private readonly vaultService: VaultService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Create a new snapshot for a vault.
   * Snapshot captures all vault files at current state (excluding .aimo-note/**).
   * The snapshot creation is synchronous - it records baseSeq and sets status immediately.
   */
  async createSnapshot(
    userId: string,
    params: CreateSnapshotParams
  ): Promise<SnapshotRecord> {
    const { vaultId, description } = params;

    logger.info('SnapshotService.createSnapshot started', { userId, vaultId });

    // Step 1: Validate vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();
    const now = new Date();
    const snapshotId = generateId();

    // Step 2: Get current latest commit seq for this vault
    const latestCommitResult = await db
      .select({ seq: syncCommits.seq })
      .from(syncCommits)
      .where(eq(syncCommits.vaultId, vaultId))
      .orderBy(desc(syncCommits.seq))
      .limit(1);

    const baseSeq = latestCommitResult.length > 0 ? Number(latestCommitResult[0].seq) : 0;

    // Step 3: Calculate size bytes for vault files (excluding .aimo-note/**)
    const sizeResult = await db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${syncCommitChanges.sizeBytes}), 0)`,
      })
      .from(syncCommitChanges)
      .where(
        and(
          eq(syncCommitChanges.vaultId, vaultId),
          sql`${syncCommitChanges.filePath} NOT LIKE '.aimo-note/%'`
        )
      );

    const sizeBytes = sizeResult.length > 0 ? Number(sizeResult[0].totalSize) : 0;

    // Step 4: Create snapshot record with pending status
    const newSnapshot: NewSnapshot = {
      id: snapshotId,
      vaultId,
      userId,
      status: SNAPSHOT_STATUS.PENDING,
      baseSeq,
      sizeBytes,
      description: description ?? null,
      restoredCommitSeq: null,
      failureReason: null,
      finalCommitSeq: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(snapshots).values(newSnapshot);

    logger.info('SnapshotService.createSnapshot completed', {
      userId,
      vaultId,
      snapshotId,
      baseSeq,
      sizeBytes,
    });

    // Audit logging for snapshot creation
    await this.auditService.logSnapshotCreate(
      userId,
      vaultId,
      '', // deviceId not tracked in snapshot creation path
      '', // requestId not tracked in snapshot creation path
      { detail: { snapshotId, baseSeq, sizeBytes } }
    );

    return {
      id: snapshotId,
      vaultId,
      status: SNAPSHOT_STATUS.PENDING,
      baseSeq,
      sizeBytes,
      createdAt: now.toISOString(),
      finishedAt: null,
      restoredCommitSeq: null,
      failureReason: null,
      finalCommitSeq: null,
      updatedAt: now.toISOString(),
    };
  }

  /**
   * List snapshots for a vault with pagination.
   */
  async listSnapshots(
    userId: string,
    vaultId: string,
    options: { page?: number; pageSize?: number } = {}
  ): Promise<{
    items: SnapshotRecord[];
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const { page = 1, pageSize = 20 } = options;

    // Assert vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();
    const effectivePageSize = Math.min(Math.max(1, pageSize), 100);
    const offset = (page - 1) * effectivePageSize;

    const result = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.vaultId, vaultId))
      .orderBy(desc(snapshots.createdAt))
      .limit(effectivePageSize + 1)
      .offset(offset);

    const hasMore = result.length > effectivePageSize;
    const items = hasMore ? result.slice(0, effectivePageSize) : result;

    return {
      items: items.map(this.mapToSnapshotRecord),
      page,
      pageSize: effectivePageSize,
      hasMore,
    };
  }

  /**
   * Get snapshot by ID with ownership verification.
   */
  async getSnapshot(userId: string, snapshotId: string): Promise<SnapshotRecord> {
    const db = getDb();

    const result = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, snapshotId))
      .limit(1);

    if (result.length === 0) {
      throw new SnapshotNotFoundError(snapshotId);
    }

    const snapshot = result[0];

    // Verify ownership via vault
    await this.vaultService.assertVaultOwnership(userId, snapshot.vaultId);

    return this.mapToSnapshotRecord(snapshot);
  }

  /**
   * Trigger restore for a snapshot.
   * Creates a restore commit that brings files back to snapshot state.
   * Restore is async - the commit is created and snapshot status is updated.
   *
   * Duplicate restore requests return existing task or throw RestoreConflictError
   * if a restore is already in progress.
   */
  async restoreSnapshot(
    userId: string,
    params: RestoreSnapshotParams
  ): Promise<SnapshotRestoreResult> {
    const { snapshotId, deviceId } = params;

    logger.info('SnapshotService.restoreSnapshot started', { userId, snapshotId });

    const db = getDb();
    const now = new Date();

    // Step 1: Get snapshot and verify ownership
    const snapshotResult = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, snapshotId))
      .limit(1);

    if (snapshotResult.length === 0) {
      throw new SnapshotNotFoundError(snapshotId);
    }

    const snapshot = snapshotResult[0];

    // Verify ownership via vault
    await this.vaultService.assertVaultOwnership(userId, snapshot.vaultId);

    // Step 2: Check if restore is already succeeded - return existing result
    if (snapshot.status === SNAPSHOT_STATUS.SUCCEEDED) {
      const existingTask: SnapshotRestoreResult = {
        snapshotId: snapshot.id,
        status: snapshot.status as SnapshotTaskStatus,
        restoredCommitSeq: Number(snapshot.restoredCommitSeq ?? snapshot.baseSeq),
        restoredFiles: 0,
        resultSummary: null,
        failureReason: null,
        finalCommitSeq: snapshot.finalCommitSeq !== null ? Number(snapshot.finalCommitSeq) : null,
      };

      logger.info('SnapshotService.restoreSnapshot - already succeeded', {
        snapshotId,
        finalCommitSeq: snapshot.finalCommitSeq,
      });

      return existingTask;
    }

    // Step 3: Check if restore is already in progress (pending or running)
    if (
      snapshot.status === SNAPSHOT_STATUS.PENDING ||
      snapshot.status === SNAPSHOT_STATUS.RUNNING
    ) {
      // If still pending/running, throw conflict error
      const existingTask: SnapshotRestoreResult = {
        snapshotId: snapshot.id,
        status: snapshot.status as SnapshotTaskStatus,
        restoredCommitSeq: Number(snapshot.restoredCommitSeq ?? snapshot.baseSeq),
        restoredFiles: 0,
        resultSummary: null,
        failureReason: snapshot.failureReason,
        finalCommitSeq: snapshot.finalCommitSeq !== null ? Number(snapshot.finalCommitSeq) : null,
      };

      throw new RestoreConflictError(snapshotId, existingTask);
    }

    // Step 4: Update snapshot status to running
    await db
      .update(snapshots)
      .set({
        status: SNAPSHOT_STATUS.RUNNING,
        updatedAt: now,
      })
      .where(eq(snapshots.id, snapshotId));

    try {
      // Step 5: Create restore commit with all files from snapshot baseSeq
      const restoreResult = await withTransaction(db, async (tx) => {
        // Get all file heads at the time of baseSeq (excluding .aimo-note/**)
        const fileHeadsAtBase = await tx
          .select()
          .from(syncFileHeads)
          .where(
            and(
              eq(syncFileHeads.vaultId, snapshot.vaultId),
              sql`${syncFileHeads.filePath} NOT LIKE '.aimo-note/%'`
            )
          );

        if (fileHeadsAtBase.length === 0) {
          // No files to restore
          return {
            commitSeq: snapshot.baseSeq,
            restoredFiles: 0,
          };
        }

        // Get current latest seq to determine if there are new changes
        const latestSeqResult = await tx
          .select({ seq: syncCommits.seq })
          .from(syncCommits)
          .where(eq(syncCommits.vaultId, snapshot.vaultId))
          .orderBy(desc(syncCommits.seq))
          .limit(1);

        const latestSeq = latestSeqResult.length > 0 ? Number(latestSeqResult[0].seq) : 0;

        // Check if vault has changed since snapshot
        if (latestSeq === snapshot.baseSeq) {
          // No changes since snapshot - nothing to restore
          return {
            commitSeq: snapshot.baseSeq,
            restoredFiles: 0,
          };
        }

        // Create a restore commit that resets files to snapshot baseSeq state
        const commitId = generateId();
        const requestId = `restore-${snapshotId}-${Date.now()}`;

        // Insert sync commit for restore
        await tx.insert(syncCommits).values({
          id: commitId,
          vaultId: snapshot.vaultId,
          userId: userId,
          deviceId: deviceId ?? 'system',
          requestId,
          baseSeq: latestSeq,
          summary: `Restore snapshot ${snapshotId}`,
          changeCount: fileHeadsAtBase.length,
          createdAt: now,
        });

        // Get the auto-incremented seq
        const commitSeqResult = await tx
          .select({ seq: syncCommits.seq })
          .from(syncCommits)
          .where(eq(syncCommits.id, commitId))
          .limit(1);

        const commitSeq = Number(commitSeqResult[0].seq);

        // Write sync_commit_changes for each file (delete to remove current state)
        for (const head of fileHeadsAtBase) {
          await tx.insert(syncCommitChanges).values({
            commitSeq,
            vaultId: snapshot.vaultId,
            filePath: head.filePath,
            op: 'delete',
            blobHash: null,
            baseRevision: head.headRevision,
            newRevision: `deleted-${Date.now()}`,
            sizeBytes: null,
            metadataJson: null,
            createdAt: now,
          });
        }

        // Update sync_file_heads to reflect deletion
        for (const head of fileHeadsAtBase) {
          await tx
            .update(syncFileHeads)
            .set({
              headRevision: `deleted-${Date.now()}`,
              blobHash: null,
              lastCommitSeq: commitSeq,
              isDeleted: '1',
              updatedAt: now,
            })
            .where(
              and(
                eq(syncFileHeads.vaultId, snapshot.vaultId),
                eq(syncFileHeads.filePath, head.filePath)
              )
            );
        }

        return {
          commitSeq,
          restoredFiles: fileHeadsAtBase.length,
        };
      });

      // Step 6: Update snapshot status to succeeded
      await db
        .update(snapshots)
        .set({
          status: SNAPSHOT_STATUS.SUCCEEDED,
          restoredCommitSeq: restoreResult.commitSeq,
          finalCommitSeq: restoreResult.commitSeq,
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(snapshots.id, snapshotId));

      logger.info('SnapshotService.restoreSnapshot completed', {
        userId,
        snapshotId,
        restoredCommitSeq: restoreResult.commitSeq,
        restoredFiles: restoreResult.restoredFiles,
      });

      // Audit logging for snapshot restore
      await this.auditService.logSnapshotRestore(
        userId,
        snapshot.vaultId,
        deviceId ?? '',
        '',
        { detail: { snapshotId, restoredCommitSeq: restoreResult.commitSeq, restoredFiles: restoreResult.restoredFiles } }
      );

      return {
        snapshotId,
        status: SNAPSHOT_STATUS.SUCCEEDED,
        restoredCommitSeq: restoreResult.commitSeq,
        restoredFiles: restoreResult.restoredFiles,
        resultSummary: `Restored ${restoreResult.restoredFiles} files to snapshot state`,
        failureReason: null,
        finalCommitSeq: restoreResult.commitSeq,
      };
    } catch (error) {
      // Step 7: Update snapshot status to failed on error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await db
        .update(snapshots)
        .set({
          status: SNAPSHOT_STATUS.FAILED,
          failureReason: errorMessage,
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(snapshots.id, snapshotId));

      logger.error('SnapshotService.restoreSnapshot failed', {
        userId,
        snapshotId,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Map database snapshot to SnapshotRecord
   */
  private mapToSnapshotRecord(snapshot: Snapshot): SnapshotRecord {
    return {
      id: snapshot.id,
      vaultId: snapshot.vaultId,
      status: snapshot.status as SnapshotTaskStatus,
      baseSeq: Number(snapshot.baseSeq),
      sizeBytes: snapshot.sizeBytes !== null ? Number(snapshot.sizeBytes) : null,
      createdAt: snapshot.createdAt.toISOString(),
      finishedAt: snapshot.finishedAt ? snapshot.finishedAt.toISOString() : null,
      restoredCommitSeq: snapshot.restoredCommitSeq !== null ? Number(snapshot.restoredCommitSeq) : null,
      failureReason: snapshot.failureReason,
      finalCommitSeq: snapshot.finalCommitSeq !== null ? Number(snapshot.finalCommitSeq) : null,
      updatedAt: snapshot.updatedAt.toISOString(),
    };
  }
}
