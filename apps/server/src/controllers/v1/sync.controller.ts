import { Controller, Post, Get, Body, QueryParams, Req, Res } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import type { Response } from 'express';
import { BlobService } from '../../services/blob.service.js';
import { SyncCommitService } from '../../services/sync-commit.service.js';
import { SyncPullService } from '../../services/sync-pull.service.js';
import { CursorService } from '../../services/cursor.service.js';
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
  uploadUrl: string;
  storageKey: string;
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
  changes: SyncChangeInput[];
}

export interface SyncCommitResponse {
  commitSeq: number;
  appliedChanges: number;
}

export interface SyncConflictDetail {
  filePath: string;
  baseRevision: string;
  headRevision: string;
  winningCommitSeq: number;
}

export interface SyncConflictResponse {
  conflicts: SyncConflictDetail[];
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

@Service()
@Controller('/api/v1/sync')
export class SyncController {
  constructor(
    private readonly blobService: BlobService,
    private readonly syncCommitService: SyncCommitService,
    private readonly syncPullService: SyncPullService,
    private readonly cursorService: CursorService
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
      const existsMap = await this.blobService.hasBlobs(req.user.id, vaultId, blobHashes);

      const results: Array<{ blobHash: string; exists: boolean }> = [];
      existsMap.forEach((exists, blobHash) => {
        results.push({ blobHash, exists });
      });

      return ResponseUtil.success(res, { results });
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
      const { uploadUrl, storageKey } = await this.blobService.createBlobUploadUrl(
        req.user.id,
        vaultId,
        blobHash,
        sizeBytes,
        mimeType
      );

      return ResponseUtil.success(res, { uploadUrl, storageKey });
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

    const { vaultId, deviceId, requestId, baseSeq, changes } = body;

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
        changes,
      });

      return ResponseUtil.success(res, {
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
        // Duplicate requestId - idempotent success
        return ResponseUtil.error(res, error.code, error.message, 409);
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

    try {
      const result = await this.syncPullService.pull(req.user.id, {
        vaultId,
        sinceSeq,
        limit,
      });

      return ResponseUtil.success(res, {
        commits: result.commits.map((c) => ({
          seq: c.seq,
          id: c.id,
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
      });

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
}
