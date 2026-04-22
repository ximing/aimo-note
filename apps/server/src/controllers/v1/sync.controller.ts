import { Controller, Post, Body, Req, Res } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import type { Response } from 'express';
import { BlobService } from '../../services/blob.service.js';
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

@Service()
@Controller('/api/v1/sync')
export class SyncController {
  constructor(private readonly blobService: BlobService) {}

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
}
