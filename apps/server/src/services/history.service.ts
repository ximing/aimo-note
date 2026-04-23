import { Service } from 'typedi';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { syncCommitChanges } from '../db/schema/sync-commit-changes.js';
import { syncCommits } from '../db/schema/sync-commits.js';
import { blobs } from '../db/schema/blobs.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { VaultService } from './vault.service.js';

export class RevisionNotFoundError extends Error {
  code = ErrorCodes.RESOURCE_NOT_FOUND;
  constructor(revision: string) {
    super(`Revision not found: ${revision}`);
    this.name = 'RevisionNotFoundError';
  }
}

export class BlobNotVisibleError extends Error {
  code = ErrorCodes.ACCESS_DENIED;
  constructor(blobHash: string) {
    super(`Blob not visible: ${blobHash}`);
    this.name = 'BlobNotVisibleError';
  }
}

export interface HistoryEntry {
  revision: string;
  blobHash: string | null;
  commitSeq: number;
  createdAt: Date;
  deviceId: string;
  isDeleted: boolean;
}

export interface HistoryBlobInfo {
  revision: string;
  blobHash: string;
  sizeBytes: number;
  mimeType: string | null;
  isDeleted: boolean;
}

export interface GetHistoryParams {
  vaultId: string;
  filePath: string;
  page?: number;
  pageSize?: number;
}

/**
 * HistoryService handles revision history queries for sync files.
 * Provides paginated access to file revision history and blob references.
 */
@Service()
export class HistoryService {
  constructor(private readonly vaultService: VaultService) {}

  /**
   * Get paginated revision history for a file in a vault.
   */
  async getHistory(
    userId: string,
    params: GetHistoryParams
  ): Promise<{
    items: HistoryEntry[];
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const { vaultId, filePath, page = 1, pageSize = 50 } = params;

    // Assert vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();
    const effectivePageSize = Math.min(Math.max(1, pageSize), 100);

    // Query commit changes for this file with deviceId from sync_commits, ordered by commitSeq DESC
    const result = await db
      .select({
        id: syncCommitChanges.id,
        commitSeq: syncCommitChanges.commitSeq,
        filePath: syncCommitChanges.filePath,
        op: syncCommitChanges.op,
        blobHash: syncCommitChanges.blobHash,
        newRevision: syncCommitChanges.newRevision,
        createdAt: syncCommitChanges.createdAt,
        deviceId: syncCommits.deviceId,
      })
      .from(syncCommitChanges)
      .innerJoin(
        syncCommits,
        eq(syncCommits.seq, syncCommitChanges.commitSeq)
      )
      .where(
        and(
          eq(syncCommitChanges.vaultId, vaultId),
          eq(syncCommitChanges.filePath, filePath)
        )
      )
      .orderBy(desc(syncCommitChanges.commitSeq))
      .limit(effectivePageSize + 1); // +1 to check hasMore

    const hasMore = result.length > effectivePageSize;
    const items = hasMore ? result.slice(0, effectivePageSize) : result;

    logger.debug('HistoryService.getHistory', {
      userId,
      vaultId,
      filePath,
      page,
      pageSize: effectivePageSize,
      resultCount: items.length,
      hasMore,
    });

    return {
      items: items.map((row) => ({
        revision: row.newRevision ?? `seq_${row.commitSeq}`,
        blobHash: row.blobHash,
        commitSeq: Number(row.commitSeq),
        createdAt: row.createdAt,
        deviceId: row.deviceId ?? '',
        isDeleted: row.op === 'delete',
      })),
      page,
      pageSize: effectivePageSize,
      hasMore,
    };
  }

  /**
   * Get blob reference for a specific revision.
   */
  async getHistoryBlob(
    userId: string,
    vaultId: string,
    revision: string
  ): Promise<HistoryBlobInfo> {
    // Assert vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();

    // Find the commit change with this revision
    // The revision is stored as newRevision in sync_commit_changes
    const result = await db
      .select({
        id: syncCommitChanges.id,
        commitSeq: syncCommitChanges.commitSeq,
        filePath: syncCommitChanges.filePath,
        op: syncCommitChanges.op,
        blobHash: syncCommitChanges.blobHash,
        newRevision: syncCommitChanges.newRevision,
        createdAt: syncCommitChanges.createdAt,
      })
      .from(syncCommitChanges)
      .where(
        and(
          eq(syncCommitChanges.vaultId, vaultId),
          eq(syncCommitChanges.newRevision, revision)
        )
      )
      .limit(1);

    if (result.length === 0) {
      throw new RevisionNotFoundError(revision);
    }

    const row = result[0];

    if (!row.blobHash) {
      throw new RevisionNotFoundError(revision);
    }

    // Get blob metadata to verify visibility and get size/mimeType
    const blobResult = await db
      .select()
      .from(blobs)
      .where(
        and(
          eq(blobs.vaultId, vaultId),
          eq(blobs.blobHash, row.blobHash)
        )
      )
      .limit(1);

    if (blobResult.length === 0) {
      throw new BlobNotVisibleError(row.blobHash);
    }

    const blob = blobResult[0];

    return {
      revision: row.newRevision ?? `seq_${row.commitSeq}`,
      blobHash: row.blobHash,
      sizeBytes: Number(blob.sizeBytes),
      mimeType: blob.mimeType,
      isDeleted: row.op === 'delete',
    };
  }
}