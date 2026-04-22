import { Service } from 'typedi';
import { eq, and, gt, asc, inArray } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { syncCommits } from '../db/schema/sync-commits.js';
import { syncCommitChanges } from '../db/schema/sync-commit-changes.js';
import { blobs } from '../db/schema/blobs.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { VaultService } from './vault.service.js';

const DEFAULT_PULL_LIMIT = 200;
const MAX_PULL_LIMIT = 1000;

export class InvalidSinceSeqError extends Error {
  code = ErrorCodes.VALIDATION_ERROR;
  constructor(sinceSeq: number) {
    super(`sinceSeq must be >= 0, got: ${sinceSeq}`);
    this.name = 'InvalidSinceSeqError';
  }
}

export interface PullResult {
  commits: Array<{
    seq: number;
    id: string;
    deviceId: string;
    requestId: string;
    baseSeq: number | null;
    changeCount: number;
    createdAt: Date;
  }>;
  changes: Array<{
    id: number;
    commitSeq: number;
    filePath: string;
    op: string;
    blobHash: string | null;
    baseRevision: string | null;
    newRevision: string | null;
    sizeBytes: number | null;
    metadataJson: string | null;
    createdAt: Date;
  }>;
  blobRefs: Array<{
    blobHash: string;
    sizeBytes: number;
    mimeType: string | null;
  }>;
  latestSeq: number;
  hasMore: boolean;
}

export interface PullParams {
  vaultId: string;
  sinceSeq: number;
  limit?: number;
}

/**
 * SyncPullService handles pulling sync commits and changes for a vault.
 * Provides paginated access to the sync log with cursor-based iteration.
 */
@Service()
export class SyncPullService {
  constructor(private readonly vaultService: VaultService) {}

  /**
   * Pull sync commits and changes since a given sequence number.
   *
   * @param userId - The user requesting the pull
   * @param params - Pull parameters including vaultId, sinceSeq, and limit
   * @returns Pull result with commits, changes, blobRefs, latestSeq, and hasMore flag
   * @throws InvalidSinceSeqError if sinceSeq < 0
   * @throws VaultAccessDeniedError if user doesn't have access to the vault
   */
  async pull(userId: string, params: PullParams): Promise<PullResult> {
    const { vaultId, sinceSeq, limit = DEFAULT_PULL_LIMIT } = params;

    // Validate sinceSeq
    if (sinceSeq < 0) {
      throw new InvalidSinceSeqError(sinceSeq);
    }

    // Validate limit
    let effectiveLimit = Math.min(limit ?? DEFAULT_PULL_LIMIT, MAX_PULL_LIMIT);
    if (effectiveLimit <= 0) {
      effectiveLimit = DEFAULT_PULL_LIMIT;
    }

    // Assert vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    logger.info('SyncPullService.pull started', {
      userId,
      vaultId,
      sinceSeq,
      limit: effectiveLimit,
    });

    const db = getDb();

    // Query commits with seq > sinceSeq, ordered by seq ASC, limit + 1 to check hasMore
    const commitsResult = await db
      .select({
        seq: syncCommits.seq,
        id: syncCommits.id,
        deviceId: syncCommits.deviceId,
        requestId: syncCommits.requestId,
        baseSeq: syncCommits.baseSeq,
        changeCount: syncCommits.changeCount,
        createdAt: syncCommits.createdAt,
      })
      .from(syncCommits)
      .where(and(eq(syncCommits.vaultId, vaultId), gt(syncCommits.seq, sinceSeq)))
      .orderBy(asc(syncCommits.seq))
      .limit(effectiveLimit + 1);

    // Determine if there are more results
    const hasMore = commitsResult.length > effectiveLimit;
    const commits = hasMore ? commitsResult.slice(0, effectiveLimit) : commitsResult;

    // Get the latest seq from the last commit (or sinceSeq if no commits)
    let latestSeq = sinceSeq;
    if (commits.length > 0) {
      latestSeq = Number(commits[commits.length - 1].seq);
    }

    // If no commits, return empty result
    if (commits.length === 0) {
      return {
        commits: [],
        changes: [],
        blobRefs: [],
        latestSeq,
        hasMore: false,
      };
    }

    // Get commit seqs for change query
    const commitSeqs = commits.map((c) => Number(c.seq));

    // Query changes for these commits
    const changesResult = await db
      .select({
        id: syncCommitChanges.id,
        commitSeq: syncCommitChanges.commitSeq,
        filePath: syncCommitChanges.filePath,
        op: syncCommitChanges.op,
        blobHash: syncCommitChanges.blobHash,
        baseRevision: syncCommitChanges.baseRevision,
        newRevision: syncCommitChanges.newRevision,
        sizeBytes: syncCommitChanges.sizeBytes,
        metadataJson: syncCommitChanges.metadataJson,
        createdAt: syncCommitChanges.createdAt,
      })
      .from(syncCommitChanges)
      .where(and(
        eq(syncCommitChanges.vaultId, vaultId),
        inArray(syncCommitChanges.commitSeq, commitSeqs)
      ))
      .orderBy(asc(syncCommitChanges.commitSeq));

    // Filter changes to only include those with seq > sinceSeq
    const filteredChanges = changesResult.filter((change) => {
      const changeSeq = Number(change.commitSeq);
      return changeSeq > sinceSeq;
    });

    // Collect unique blob hashes from changes
    const blobHashes = new Set<string>();
    for (const change of filteredChanges) {
      if (change.blobHash) {
        blobHashes.add(change.blobHash);
      }
    }

    // Query blob metadata (only visible metadata, not download URLs)
    let blobRefs: Array<{ blobHash: string; sizeBytes: number; mimeType: string | null }> = [];
    if (blobHashes.size > 0) {
      const hashArray = Array.from(blobHashes);
      const blobResult = await db
        .select({
          blobHash: blobs.blobHash,
          sizeBytes: blobs.sizeBytes,
          mimeType: blobs.mimeType,
        })
        .from(blobs)
        .where(and(
          eq(blobs.vaultId, vaultId),
          inArray(blobs.blobHash, hashArray)
        ));

      blobRefs = blobResult.map((b) => ({
          blobHash: b.blobHash,
          sizeBytes: Number(b.sizeBytes),
          mimeType: b.mimeType,
        }));
    }

    logger.info('SyncPullService.pull completed', {
      userId,
      vaultId,
      sinceSeq,
      commitCount: commits.length,
      changeCount: filteredChanges.length,
      blobRefCount: blobRefs.length,
      latestSeq,
      hasMore,
    });

    return {
      commits: commits.map((c) => ({
        seq: Number(c.seq),
        id: c.id,
        deviceId: c.deviceId,
        requestId: c.requestId,
        baseSeq: c.baseSeq != null ? Number(c.baseSeq) : null,
        changeCount: Number(c.changeCount),
        createdAt: c.createdAt,
      })),
      changes: filteredChanges.map((c) => ({
        id: Number(c.id),
        commitSeq: Number(c.commitSeq),
        filePath: c.filePath,
        op: c.op,
        blobHash: c.blobHash,
        baseRevision: c.baseRevision,
        newRevision: c.newRevision,
        sizeBytes: c.sizeBytes != null ? Number(c.sizeBytes) : null,
        metadataJson: c.metadataJson,
        createdAt: c.createdAt,
      })),
      blobRefs,
      latestSeq,
      hasMore,
    };
  }
}
