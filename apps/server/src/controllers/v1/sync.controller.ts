import { Controller, Post, Get, Body, QueryParams, Param, Req, Res } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import type { Response } from 'express';
import { BlobService } from '../../services/blob.service.js';
import { SyncCommitService } from '../../services/sync-commit.service.js';
import { SyncPullService } from '../../services/sync-pull.service.js';
import { CursorService } from '../../services/cursor.service.js';
import { ConflictService } from '../../services/conflict.service.js';
import { HistoryService } from '../../services/history.service.js';
import { DiagnosticsService } from '../../services/diagnostics.service.js';
import { AuditService } from '../../services/audit.service.js';
import { ResponseUtil } from '../../utils/response.js';
import { ErrorCodes } from '../../constants/error-codes.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { Service } from 'typedi';

// Request/Response types
export interface HasBlobsBody {
  vaultId: string;
  blobHashes: string[];
}

export interface HasBlobsResponse {
  results: Array<{ blobHash: string; exists: boolean }>;
}

export interface BlobUploadUrlBody {
  vaultId: string;
  blobHash: string;
  sizeBytes: number;
  mimeType: string;
}

export interface BlobUploadUrlResponse {
  blobHash: string;
  storageKey: string;
  uploadUrl: string;
  headers?: Record<string, string>;
  expiresIn: number;
}

export interface BlobDownloadUrlBody {
  vaultId: string;
  blobHash: string;
}

export interface BlobDownloadUrlResponse {
  downloadUrl: string;
  metadata: {
    blobHash: string;
    sizeBytes: number;
    mimeType: string | null;
    storageKey: string;
    refCount: number;
  };
}

export interface SyncChangeInput {
  filePath: string;
  op: 'upsert' | 'delete';
  blobHash: string | null;
  baseRevision: string | null;
  newRevision: string;
  sizeBytes: number | null;
  metadataJson: string | null;
}

export interface SyncCommitBody {
  vaultId: string;
  deviceId: string;
  requestId: string;
  baseSeq: number | null;
  summary?: string;
  changes: SyncChangeInput[];
}

export interface SyncCommitResponse {
  commitSeq: number;
  appliedChanges: number;
}

export interface SyncConflictDetail {
  filePath: string;
  expectedBaseRevision: string;
  actualHeadRevision: string;
  remoteBlobHash: string | null;
  winningCommitSeq: number;
}

export interface SyncConflictResponse {
  items: SyncConflictDetail[];
}

export interface SyncPullQuery {
  vaultId: string;
  sinceSeq: number;
  limit?: number;
}

export interface SyncPullResponse {
  commits: Array<{
    seq: number;
    id: string;
    deviceId: string;
    requestId: string;
    baseSeq: number | null;
    changeCount: number;
    createdAt: string;
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
    createdAt: string;
  }>;
  blobRefs: Array<{
    blobHash: string;
    sizeBytes: number;
    mimeType: string | null;
  }>;
  latestSeq: number;
  hasMore: boolean;
}

export interface SyncAckBody {
  vaultId: string;
  deviceId: string;
  ackedSeq: number;
}

export interface SyncAckResponse {
  vaultId: string;
  deviceId: string;
  lastPulledSeq: number;
  updatedAt: string;
}

// Conflict query params
export interface SyncConflictsQuery {
  vaultId: string;
}

// Conflict resolve params
export interface SyncConflictResolveBody {
  vaultId: string;
  resolutionPath?: string;
}

// History query params
export interface SyncHistoryQuery {
  vaultId: string;
  filePath: string;
  page?: number;
  pageSize?: number;
}

// History blob query params
export interface SyncHistoryBlobQuery {
  vaultId: string;
  revision: string;
}

// Diagnostics query params
export interface SyncDiagnosticsQuery {
  vaultId: string;
  deviceId?: string;
}

// Diagnostics runtime event body
export interface SyncRuntimeEventBody {
  vaultId: string;
  deviceId: string;
  trigger: string;
  retryCount: number;
  offlineStartedAt?: string | null;
  recoveredAt?: string | null;
  nextRetryAt?: string | null;
  requestId: string;
}

@Service()
@Controller('/api/v1/sync')
export class SyncController {
  constructor(
    private readonly blobService: BlobService,
    private readonly syncCommitService: SyncCommitService,
    private readonly syncPullService: SyncPullService,
    private readonly cursorService: CursorService,
    private readonly conflictService: ConflictService,
    private readonly historyService: HistoryService,
    private readonly diagnosticsService: DiagnosticsService,
    private readonly auditService: AuditService
  ) {}

  /**
   * POST /api/v1/sync/has-blobs
   * Check which blobs exist in a vault
   */
  @Post('/has-blobs')
  @OpenAPI({
    summary: 'Check blob existence',
    description: 'Checks which blobs exist for a given vault',
    responses: {
      200: { description: 'Blob existence check results' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied to vault' },
    },
  })
  async hasBlobs(@Body() body: HasBlobsBody, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    // Validate X-Device-Id header is present
    if (!req.deviceId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'X-Device-Id header is required for sync endpoints',
        400
      );
    }

    // Validate X-Request-Id header is present
    if (!req.requestId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'X-Request-Id header is required for sync endpoints',
        400
      );
    }

    const { vaultId, blobHashes } = body;

    // Validate input
    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'vaultId is required',
        400
      );
    }

    if (!Array.isArray(blobHashes) || blobHashes.length === 0) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'blobHashes must be a non-empty array',
        400
      );
    }

    if (blobHashes.some((h) => typeof h !== 'string' || h.length === 0)) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'Each blobHash must be a non-empty string',
        400
      );
    }

    try {
      const existsMap = await this.blobService.hasBlobs(req.user.id, vaultId, req.deviceId!, blobHashes);

      const existing: string[] = [];
      const missing: string[] = [];
      existsMap.forEach((exists, blobHash) => {
        if (exists) {
          existing.push(blobHash);
        } else {
          missing.push(blobHash);
        }
      });

      return ResponseUtil.success(res, { existing, missing });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.RESOURCE_NOT_FOUND) {
        return ResponseUtil.error(res, error.code, error.message, 404);
      }
      throw error;
    }
  }

  /**
   * POST /api/v1/sync/blob-upload-url
   * Generate a presigned URL for uploading a blob
   */
  @Post('/blob-upload-url')
  @OpenAPI({
    summary: 'Generate blob upload URL',
    description: 'Generates a presigned S3 URL for uploading a blob',
    responses: {
      200: { description: 'Presigned upload URL' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied to vault' },
    },
  })
  async createBlobUploadUrl(
    @Body() body: BlobUploadUrlBody,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
  ) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    // Validate X-Device-Id header is present
    if (!req.deviceId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'X-Device-Id header is required for sync endpoints',
        400
      );
    }

    const { vaultId, blobHash, sizeBytes, mimeType } = body;

    // Validate input
    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'vaultId is required',
        400
      );
    }

    if (!blobHash || typeof blobHash !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'blobHash is required',
        400
      );
    }

    if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'sizeBytes must be a positive number',
        400
      );
    }

    if (!mimeType || typeof mimeType !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'mimeType is required',
        400
      );
    }

    try {
      const result = await this.blobService.createBlobUploadUrl(
        req.user.id,
        vaultId,
        req.deviceId!,
        blobHash,
        sizeBytes,
        mimeType
      );

      return ResponseUtil.success(res, {
        blobHash: result.blobHash,
        storageKey: result.storageKey,
        uploadUrl: result.uploadUrl,
        headers: result.headers,
        expiresIn: result.expiresIn,
      });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.RESOURCE_NOT_FOUND) {
        return ResponseUtil.error(res, error.code, error.message, 404);
      }
      throw error;
    }
  }

  /**
   * POST /api/v1/sync/blob-download-url
   * Generate a presigned URL for downloading a blob
   */
  @Post('/blob-download-url')
  @OpenAPI({
    summary: 'Generate blob download URL',
    description: 'Generates a presigned S3 URL for downloading a blob',
    responses: {
      200: { description: 'Presigned download URL with metadata' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied to vault' },
      404: { description: 'Blob not found' },
    },
  })
  async createBlobDownloadUrl(
    @Body() body: BlobDownloadUrlBody,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
  ) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    // Validate X-Device-Id header is present
    if (!req.deviceId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'X-Device-Id header is required for sync endpoints',
        400
      );
    }

    const { vaultId, blobHash } = body;

    // Validate input
    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'vaultId is required',
        400
      );
    }

    if (!blobHash || typeof blobHash !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'blobHash is required',
        400
      );
    }

    try {
      const { downloadUrl, metadata } = await this.blobService.createBlobDownloadUrl(
        req.user.id,
        vaultId,
        req.deviceId!,
        blobHash
      );

      return ResponseUtil.success(res, {
        downloadUrl,
        metadata: {
          blobHash: metadata.blobHash,
          sizeBytes: metadata.sizeBytes,
          mimeType: metadata.mimeType,
          storageKey: metadata.storageKey,
          refCount: metadata.refCount,
        },
      });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.RESOURCE_NOT_FOUND) {
        return ResponseUtil.error(res, error.code, error.message, 404);
      }
      throw error;
    }
  }

  /**
   * POST /api/v1/sync/commit
   * Commit a batch of sync changes
   */
  @Post('/commit')
  @OpenAPI({
    summary: 'Commit sync changes',
    description: 'Commits a batch of file changes to the vault',
    responses: {
      200: { description: 'Commit successful' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
      409: { description: 'Sync conflict detected' },
    },
  })
  async commit(@Body() body: SyncCommitBody, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    // Validate X-Device-Id header is present
    if (!req.deviceId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'X-Device-Id header is required for sync endpoints',
        400
      );
    }

    const { vaultId, deviceId, requestId, baseSeq, summary, changes } = body;

    // Validate input
    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'vaultId is required', 400);
    }

    if (!deviceId || typeof deviceId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'deviceId is required', 400);
    }

    if (!requestId || typeof requestId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'requestId is required', 400);
    }

    // Validate header/body consistency for deviceId
    if (req.deviceId !== deviceId) {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'deviceId in body must match X-Device-Id header', 400);
    }

    // Validate header/body consistency for requestId
    if (req.requestId !== requestId) {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'requestId in body must match X-Request-Id header', 400);
    }

    if (baseSeq !== null && typeof baseSeq !== 'number') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'baseSeq must be a number or null', 400);
    }

    if (!Array.isArray(changes) || changes.length === 0) {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'changes must be a non-empty array', 400);
    }

    // Validate each change
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (!change.filePath || typeof change.filePath !== 'string') {
        return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, `changes[${i}].filePath is required`, 400);
      }
      if (change.op !== 'upsert' && change.op !== 'delete') {
        return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, `changes[${i}].op must be "upsert" or "delete"`, 400);
      }
      if (change.blobHash !== null && typeof change.blobHash !== 'string') {
        return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, `changes[${i}].blobHash must be a string or null`, 400);
      }
      if (change.baseRevision !== null && typeof change.baseRevision !== 'string') {
        return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, `changes[${i}].baseRevision must be a string or null`, 400);
      }
      if (!change.newRevision || typeof change.newRevision !== 'string') {
        return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, `changes[${i}].newRevision is required`, 400);
      }
    }

    try {
      const result = await this.syncCommitService.commit(req.user.id, {
        vaultId,
        deviceId,
        requestId,
        baseSeq,
        summary,
        changes,
      });

      return ResponseUtil.success(res, {
        accepted: true,
        commitId: result.commitId,
        commitSeq: result.commitSeq,
        appliedChanges: result.appliedChanges,
      });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.RESOURCE_NOT_FOUND) {
        return ResponseUtil.error(res, error.code, error.message, 404);
      }
      if (error.code === ErrorCodes.SYNC_CONFLICT) {
        // Return 409 Conflict with conflict details
        return ResponseUtil.error(res, error.code, error.message, 409, {
          conflicts: error.conflicts,
        });
      }
      if (error.code === ErrorCodes.VALIDATION_ERROR) {
        return ResponseUtil.error(res, error.code, error.message, 400);
      }
      if (error.code === ErrorCodes.RESOURCE_ALREADY_EXISTS) {
        // Duplicate requestId - idempotent success, return existing commit result
        return ResponseUtil.success(res, {
          accepted: true,
          commitSeq: error.existingCommitSeq,
          appliedChanges: error.appliedChanges ?? 0,
        });
      }
      throw error;
    }
  }

  /**
   * GET /api/v1/sync/pull
   * Pull sync commits and changes since a given sequence number
   */
  @Get('/pull')
  @OpenAPI({
    summary: 'Pull sync changes',
    description: 'Pulls commits and changes since a given sequence number',
    responses: {
      200: { description: 'Pull successful with commits, changes, and blobRefs' },
      400: { description: 'Validation error (sinceSeq < 0)' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied to vault' },
    },
  })
  async pull(@QueryParams() query: SyncPullQuery, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    const { vaultId, sinceSeq, limit } = query;

    // Validate vaultId
    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'vaultId is required',
        400
      );
    }

    // Validate sinceSeq
    if (typeof sinceSeq !== 'number' || sinceSeq < 0) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'sinceSeq must be a number >= 0',
        400
      );
    }

    // Validate limit if provided
    if (limit !== undefined && (typeof limit !== 'number' || limit <= 0)) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'limit must be a positive number',
        400
      );
    }

    // Validate X-Device-Id header is present
    if (!req.deviceId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'X-Device-Id header is required for pull endpoint',
        400
      );
    }

    // Validate X-Request-Id header is present
    if (!req.requestId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'X-Request-Id header is required for pull endpoint',
        400
      );
    }

    try {
      const result = await this.syncPullService.pull(req.user.id, {
        vaultId,
        sinceSeq,
        limit,
        requestId: req.requestId,
        deviceId: req.deviceId ?? undefined,
      });

      // Audit logging for pull operation
      await this.auditService.logSyncPull(
        req.user.id,
        vaultId,
        req.deviceId ?? '',
        req.requestId ?? '',
        { detail: { sinceSeq, limit, commitCount: result.commits.length } }
      );

      return ResponseUtil.success(res, {
        vaultId,
        commits: result.commits.map((c) => ({
          seq: c.seq,
          id: c.id,
          userId: c.userId,
          deviceId: c.deviceId,
          requestId: c.requestId,
          baseSeq: c.baseSeq,
          changeCount: c.changeCount,
          createdAt: c.createdAt.toISOString(),
        })),
        changes: result.changes.map((c) => ({
          id: c.id,
          commitSeq: c.commitSeq,
          filePath: c.filePath,
          op: c.op,
          blobHash: c.blobHash,
          baseRevision: c.baseRevision,
          newRevision: c.newRevision,
          sizeBytes: c.sizeBytes,
          metadataJson: c.metadataJson,
          createdAt: c.createdAt.toISOString(),
        })),
        blobRefs: result.blobRefs,
        latestSeq: result.latestSeq,
        hasMore: result.hasMore,
      });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.VALIDATION_ERROR) {
        return ResponseUtil.error(res, error.code, error.message, 400);
      }
      throw error;
    }
  }

  /**
   * POST /api/v1/sync/ack
   * Acknowledge that the client has processed up to a certain sequence number
   */
  @Post('/ack')
  @OpenAPI({
    summary: 'Acknowledge sync cursor',
    description: 'Acknowledges that the client has processed commits up to a certain sequence number',
    responses: {
      200: { description: 'Ack successful' },
      400: { description: 'Validation error (cursor regression)' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
    },
  })
  async ack(@Body() body: SyncAckBody, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    // Validate X-Device-Id header is present
    if (!req.deviceId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'X-Device-Id header is required for sync endpoints',
        400
      );
    }

    // Validate X-Request-Id header is present
    if (!req.requestId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'X-Request-Id header is required for sync endpoints',
        400
      );
    }

    const { vaultId, deviceId, ackedSeq } = body;

    // Validate vaultId
    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'vaultId is required',
        400
      );
    }

    // Validate deviceId
    if (!deviceId || typeof deviceId !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'deviceId is required',
        400
      );
    }

    // Validate header/body consistency for deviceId
    if (req.deviceId !== deviceId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'deviceId in body must match X-Device-Id header',
        400
      );
    }

    // Validate ackedSeq
    if (typeof ackedSeq !== 'number' || ackedSeq < 0) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'ackedSeq must be a number >= 0',
        400
      );
    }

    try {
      const result = await this.cursorService.ack(req.user.id, {
        vaultId,
        deviceId,
        ackedSeq,
        requestId: req.requestId,
      });

      // Audit logging for ack operation
      await this.auditService.logSyncAck(
        req.user.id,
        vaultId,
        deviceId,
        req.requestId ?? '',
        { detail: { ackedSeq, lastPulledSeq: result.lastPulledSeq } }
      );

      return ResponseUtil.success(res, {
        vaultId: result.vaultId,
        deviceId: result.deviceId,
        lastPulledSeq: result.lastPulledSeq,
        updatedAt: result.updatedAt.toISOString(),
      });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.VALIDATION_ERROR) {
        return ResponseUtil.error(res, error.code, error.message, 400);
      }
      throw error;
    }
  }

  /**
   * GET /api/v1/sync/conflicts
   * Get unresolved conflicts for a vault
   */
  @Get('/conflicts')
  @OpenAPI({
    summary: 'Get unresolved conflicts',
    description: 'Gets unresolved sync conflicts for a vault',
    responses: {
      200: { description: 'Conflict summaries' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
    },
  })
  async getConflicts(@QueryParams() query: SyncConflictsQuery, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(res, ErrorCodes.AUTH_TOKEN_MISSING, 'Not authenticated', 401);
    }

    // Validate X-Device-Id header is present
    if (!req.deviceId) {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'X-Device-Id header is required', 400);
    }

    const { vaultId } = query;

    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'vaultId is required', 400);
    }

    try {
      const conflicts = await this.conflictService.getConflicts(req.user.id, vaultId);

      return ResponseUtil.success(res, {
        items: conflicts.map((c) => ({
          id: c.id,
          filePath: c.filePath,
          expectedBaseRevision: c.losingRevision,
          actualHeadRevision: c.winningRevision,
          remoteBlobHash: c.winningBlobHash ?? '',
          winningCommitSeq: c.winningCommitSeq,
          losingDeviceId: c.losingDeviceId,
          resolvedAt: c.resolvedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
      });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.VALIDATION_ERROR) {
        return ResponseUtil.error(res, error.code, error.message, 400);
      }
      throw error;
    }
  }

  /**
   * POST /api/v1/sync/conflicts/:id/resolve
   * Mark a conflict as resolved
   */
  @Post('/conflicts/:id/resolve')
  @OpenAPI({
    summary: 'Resolve a conflict',
    description: 'Marks a sync conflict as resolved',
    responses: {
      200: { description: 'Conflict resolved' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
      404: { description: 'Conflict not found' },
    },
  })
  async resolveConflict(@Param('id') conflictId: string, @Body() body: SyncConflictResolveBody, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(res, ErrorCodes.AUTH_TOKEN_MISSING, 'Not authenticated', 401);
    }

    // Validate X-Device-Id header is present
    if (!req.deviceId) {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'X-Device-Id header is required', 400);
    }

    const { vaultId, resolutionPath } = body;

    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'vaultId is required', 400);
    }

    try {
      await this.conflictService.resolveConflict(req.user.id, vaultId, conflictId, resolutionPath);
      return ResponseUtil.success(res, { resolved: true });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.RESOURCE_NOT_FOUND) {
        return ResponseUtil.error(res, error.code, error.message, 404);
      }
      if (error.code === ErrorCodes.VALIDATION_ERROR) {
        return ResponseUtil.error(res, error.code, error.message, 400);
      }
      throw error;
    }
  }

  /**
   * GET /api/v1/sync/history
   * Get revision history for a file
   */
  @Get('/history')
  @OpenAPI({
    summary: 'Get file revision history',
    description: 'Gets paginated revision history for a file',
    responses: {
      200: { description: 'History entries' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
    },
  })
  async getHistory(@QueryParams() query: SyncHistoryQuery, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(res, ErrorCodes.AUTH_TOKEN_MISSING, 'Not authenticated', 401);
    }

    // Validate X-Device-Id header is present
    if (!req.deviceId) {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'X-Device-Id header is required', 400);
    }

    const { vaultId, filePath, page, pageSize } = query;

    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'vaultId is required', 400);
    }

    if (!filePath || typeof filePath !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'filePath is required', 400);
    }

    try {
      const result = await this.historyService.getHistory(req.user.id, {
        vaultId,
        filePath,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 50,
      });

      return ResponseUtil.success(res, result);
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.VALIDATION_ERROR) {
        return ResponseUtil.error(res, error.code, error.message, 400);
      }
      throw error;
    }
  }

  /**
   * GET /api/v1/sync/history/blob
   * Get blob reference for a specific revision
   */
  @Get('/history/blob')
  @OpenAPI({
    summary: 'Get revision blob reference',
    description: 'Gets blob reference for a specific revision',
    responses: {
      200: { description: 'Blob reference' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
      404: { description: 'Revision not found' },
    },
  })
  async getHistoryBlob(@QueryParams() query: SyncHistoryBlobQuery, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(res, ErrorCodes.AUTH_TOKEN_MISSING, 'Not authenticated', 401);
    }

    // Validate X-Device-Id header is present
    if (!req.deviceId) {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'X-Device-Id header is required', 400);
    }

    const { vaultId, revision } = query;

    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'vaultId is required', 400);
    }

    if (!revision || typeof revision !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'revision is required', 400);
    }

    try {
      const blobInfo = await this.historyService.getHistoryBlob(req.user.id, vaultId, revision);

      return ResponseUtil.success(res, blobInfo);
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.RESOURCE_NOT_FOUND) {
        return ResponseUtil.error(res, error.code, error.message, 404);
      }
      if (error.code === ErrorCodes.VALIDATION_ERROR) {
        return ResponseUtil.error(res, error.code, error.message, 400);
      }
      throw error;
    }
  }

  /**
   * GET /api/v1/sync/diagnostics
   * Get sync diagnostics for a vault
   */
  @Get('/diagnostics')
  @OpenAPI({
    summary: 'Get sync diagnostics',
    description: 'Gets sync diagnostics for a vault including trigger source, offline state, and retry info',
    responses: {
      200: { description: 'Sync diagnostics' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
    },
  })
  async getDiagnostics(@QueryParams() query: SyncDiagnosticsQuery, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(res, ErrorCodes.AUTH_TOKEN_MISSING, 'Not authenticated', 401);
    }

    const { vaultId, deviceId } = query;

    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'vaultId is required', 400);
    }

    // Use the authenticated deviceId from header if not provided
    const effectiveDeviceId = deviceId || req.deviceId;

    if (!effectiveDeviceId) {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'deviceId is required', 400);
    }

    try {
      const diagnostics = await this.diagnosticsService.getSyncDiagnostics(req.user.id, {
        vaultId,
        deviceId: effectiveDeviceId,
      });

      return ResponseUtil.success(res, diagnostics);
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.VALIDATION_ERROR) {
        return ResponseUtil.error(res, error.code, error.message, 400);
      }
      throw error;
    }
  }

  /**
   * POST /api/v1/sync/diagnostics/events
   * Record a sync runtime event
   */
  @Post('/diagnostics/events')
  @OpenAPI({
    summary: 'Record sync runtime event',
    description: 'Records a sync runtime event for diagnostics and offline replay',
    responses: {
      200: { description: 'Event recorded' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
    },
  })
  async recordRuntimeEvent(@Body() body: SyncRuntimeEventBody, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(res, ErrorCodes.AUTH_TOKEN_MISSING, 'Not authenticated', 401);
    }

    const { vaultId, deviceId, trigger, retryCount, offlineStartedAt, recoveredAt, nextRetryAt, requestId } = body;

    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'vaultId is required', 400);
    }

    if (!deviceId || typeof deviceId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'deviceId is required', 400);
    }

    if (!trigger || typeof trigger !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'trigger is required', 400);
    }

    if (typeof retryCount !== 'number') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'retryCount must be a number', 400);
    }

    if (!requestId || typeof requestId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'requestId is required', 400);
    }

    try {
      const result = await this.diagnosticsService.recordSyncRuntimeEvent(req.user.id, {
        vaultId,
        deviceId,
        trigger: trigger as any,
        retryCount,
        offlineStartedAt,
        recoveredAt,
        nextRetryAt,
        requestId,
      });

      return ResponseUtil.success(res, {
        accepted: result.accepted,
        deduplicated: result.deduplicated,
        processedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.VALIDATION_ERROR) {
        return ResponseUtil.error(res, error.code, error.message, 400);
      }
      throw error;
    }
  }
}
