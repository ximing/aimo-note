import { Service } from 'typedi';
import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { syncConflicts, type NewSyncConflict } from '../db/schema/sync-conflicts.js';
import { syncCommitChanges } from '../db/schema/sync-commit-changes.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { VaultService } from './vault.service.js';

export class ConflictNotFoundError extends Error {
  code = ErrorCodes.RESOURCE_NOT_FOUND;
  constructor(conflictId: string) {
    super(`Conflict not found: ${conflictId}`);
    this.name = 'ConflictNotFoundError';
  }
}

export class ConflictAccessDeniedError extends Error {
  code = ErrorCodes.ACCESS_DENIED;
  constructor(userId: string, conflictId: string) {
    super(`Access denied: user ${userId} does not have access to conflict ${conflictId}`);
    this.name = 'ConflictAccessDeniedError';
  }
}

export interface ConflictSummary {
  id: string;
  vaultId: string;
  userId: string;
  filePath: string;
  losingDeviceId: string | null;
  winningRevision: string;
  losingRevision: string;
  winningCommitSeq: number;
  winningBlobHash: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface RecordConflictParams {
  vaultId: string;
  userId: string;
  filePath: string;
  losingDeviceId: string | null;
  winningRevision: string;
  losingRevision: string;
  winningCommitSeq: number;
}

/**
 * ConflictService handles sync conflict operations.
 * Manages conflict records, querying unresolved conflicts, and resolving conflicts.
 */
@Service()
export class ConflictService {
  constructor(private readonly vaultService: VaultService) {}

  /**
   * Record a new conflict for a file.
   * Called by SyncCommitService when a commit is rejected due to head mismatch.
   */
  async recordConflict(params: RecordConflictParams): Promise<ConflictSummary> {
    const { vaultId, userId, filePath, losingDeviceId, winningRevision, losingRevision, winningCommitSeq } = params;

    // Assert vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();
    const now = new Date();
    const conflictId = generateId();

    const newConflict: NewSyncConflict = {
      id: conflictId,
      vaultId,
      userId,
      filePath,
      losingDeviceId,
      winningRevision,
      losingRevision,
      winningCommitSeq,
      resolvedAt: null,
      createdAt: now,
    };

    await db.insert(syncConflicts).values(newConflict);

    logger.info('Conflict recorded', {
      conflictId,
      vaultId,
      userId,
      filePath,
      winningCommitSeq,
    });

    return {
      id: conflictId,
      vaultId,
      userId,
      filePath,
      losingDeviceId,
      winningRevision,
      losingRevision,
      winningCommitSeq,
      winningBlobHash: null,
      resolvedAt: null,
      createdAt: now,
    };
  }

  /**
   * Get all unresolved conflicts for a user + vault.
   * Joins with sync_commit_changes to get the blob hash for the winning commit.
   */
  async getConflicts(userId: string, vaultId: string): Promise<ConflictSummary[]> {
    // Assert vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();

    // Query conflicts with winning blob hash from sync_commit_changes
    const result = await db
      .select({
        id: syncConflicts.id,
        vaultId: syncConflicts.vaultId,
        userId: syncConflicts.userId,
        filePath: syncConflicts.filePath,
        losingDeviceId: syncConflicts.losingDeviceId,
        winningRevision: syncConflicts.winningRevision,
        losingRevision: syncConflicts.losingRevision,
        winningCommitSeq: syncConflicts.winningCommitSeq,
        resolvedAt: syncConflicts.resolvedAt,
        createdAt: syncConflicts.createdAt,
        winningBlobHash: syncCommitChanges.blobHash,
      })
      .from(syncConflicts)
      .leftJoin(
        syncCommitChanges,
        and(
          eq(syncCommitChanges.commitSeq, syncConflicts.winningCommitSeq),
          eq(syncCommitChanges.vaultId, syncConflicts.vaultId),
          eq(syncCommitChanges.filePath, syncConflicts.filePath)
        )
      )
      .where(
        and(
          eq(syncConflicts.userId, userId),
          eq(syncConflicts.vaultId, vaultId),
          isNull(syncConflicts.resolvedAt)
        )
      )
      .orderBy(syncConflicts.createdAt);

    return result.map((row) => ({
      id: row.id,
      vaultId: row.vaultId,
      userId: row.userId,
      filePath: row.filePath,
      losingDeviceId: row.losingDeviceId,
      winningRevision: row.winningRevision ?? '',
      losingRevision: row.losingRevision ?? '',
      winningCommitSeq: Number(row.winningCommitSeq),
      winningBlobHash: row.winningBlobHash ?? null,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Resolve a conflict by ID.
   * Must verify userId + vaultId + conflictId ownership.
   * Idempotent - resolving an already resolved conflict succeeds silently.
   */
  async resolveConflict(userId: string, vaultId: string, conflictId: string, resolutionPath?: string): Promise<void> {
    const db = getDb();

    // Find the conflict
    const existing = await db
      .select()
      .from(syncConflicts)
      .where(eq(syncConflicts.id, conflictId))
      .limit(1);

    if (existing.length === 0) {
      throw new ConflictNotFoundError(conflictId);
    }

    const conflict = existing[0];

    // Verify ownership: userId + vaultId must match
    if (conflict.userId !== userId || conflict.vaultId !== vaultId) {
      throw new ConflictAccessDeniedError(userId, conflictId);
    }

    // If already resolved, return early (idempotent)
    if (conflict.resolvedAt !== null) {
      logger.debug('Conflict already resolved', { conflictId });
      return;
    }

    // Mark as resolved
    const now = new Date();
    await db
      .update(syncConflicts)
      .set({ resolvedAt: now, resolutionPath: resolutionPath ?? null })
      .where(eq(syncConflicts.id, conflictId));

    logger.info('Conflict resolved', { conflictId, userId, vaultId });
  }

  /**
   * Find a conflict by ID.
   */
  async findById(conflictId: string): Promise<ConflictSummary | null> {
    const db = getDb();

    const result = await db
      .select({
        id: syncConflicts.id,
        vaultId: syncConflicts.vaultId,
        userId: syncConflicts.userId,
        filePath: syncConflicts.filePath,
        losingDeviceId: syncConflicts.losingDeviceId,
        winningRevision: syncConflicts.winningRevision,
        losingRevision: syncConflicts.losingRevision,
        winningCommitSeq: syncConflicts.winningCommitSeq,
        resolvedAt: syncConflicts.resolvedAt,
        createdAt: syncConflicts.createdAt,
        winningBlobHash: syncCommitChanges.blobHash,
      })
      .from(syncConflicts)
      .leftJoin(
        syncCommitChanges,
        and(
          eq(syncCommitChanges.commitSeq, syncConflicts.winningCommitSeq),
          eq(syncCommitChanges.vaultId, syncConflicts.vaultId),
          eq(syncCommitChanges.filePath, syncConflicts.filePath)
        )
      )
      .where(eq(syncConflicts.id, conflictId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      vaultId: row.vaultId,
      userId: row.userId,
      filePath: row.filePath,
      losingDeviceId: row.losingDeviceId,
      winningRevision: row.winningRevision ?? '',
      losingRevision: row.losingRevision ?? '',
      winningCommitSeq: Number(row.winningCommitSeq),
      winningBlobHash: row.winningBlobHash ?? null,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
    };
  }
}