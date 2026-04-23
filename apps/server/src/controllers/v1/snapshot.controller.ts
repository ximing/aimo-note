import { Controller, Get, Post, Body, QueryParams, Param, Req, Res } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import type { Response } from 'express';
import { SnapshotService } from '../../services/snapshot.service.js';
import { ResponseUtil } from '../../utils/response.js';
import { ErrorCodes } from '../../constants/error-codes.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { Service } from 'typedi';

// Request/Response types
export interface CreateSnapshotBody {
  vaultId: string;
  description?: string;
}

export interface ListSnapshotsQuery {
  vaultId: string;
  page?: number;
  pageSize?: number;
}

export interface GetSnapshotParams {
  id: string;
}

export interface RestoreSnapshotParams {
  id: string;
}

export interface RestoreSnapshotBody {
  vaultId: string;
  deviceId?: string;
}

@Service()
@Controller('/api/v1/snapshots')
export class SnapshotController {
  constructor(private readonly snapshotService: SnapshotService) {}

  /**
   * GET /api/v1/snapshots
   * List snapshots for a vault
   */
  @Get()
  @OpenAPI({
    summary: 'List snapshots',
    description: 'Lists snapshots for a vault with pagination',
    responses: {
      200: { description: 'Snapshot list' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
    },
  })
  async listSnapshots(@QueryParams() query: ListSnapshotsQuery, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(res, ErrorCodes.AUTH_TOKEN_MISSING, 'Not authenticated', 401);
    }

    const { vaultId, page, pageSize } = query;

    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'vaultId is required', 400);
    }

    try {
      const result = await this.snapshotService.listSnapshots(req.user.id, vaultId, {
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });

      return ResponseUtil.success(res, result);
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
   * POST /api/v1/snapshots
   * Create a new snapshot
   */
  @Post()
  @OpenAPI({
    summary: 'Create snapshot',
    description: 'Creates a new snapshot for a vault',
    responses: {
      201: { description: 'Snapshot created' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
    },
  })
  async createSnapshot(@Body() body: CreateSnapshotBody, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(res, ErrorCodes.AUTH_TOKEN_MISSING, 'Not authenticated', 401);
    }

    const { vaultId, description } = body;

    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'vaultId is required', 400);
    }

    try {
      const snapshot = await this.snapshotService.createSnapshot(req.user.id, {
        vaultId,
        description,
      });

      return ResponseUtil.created(res, snapshot);
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
   * GET /api/v1/snapshots/:id
   * Get snapshot by ID
   */
  @Get('/:id')
  @OpenAPI({
    summary: 'Get snapshot',
    description: 'Gets a snapshot by ID including task status',
    responses: {
      200: { description: 'Snapshot details' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
      404: { description: 'Snapshot not found' },
    },
  })
  async getSnapshot(@Param('id') id: string, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(res, ErrorCodes.AUTH_TOKEN_MISSING, 'Not authenticated', 401);
    }

    if (!id || typeof id !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'snapshot id is required', 400);
    }

    try {
      const snapshot = await this.snapshotService.getSnapshot(req.user.id, id);

      return ResponseUtil.success(res, snapshot);
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
   * POST /api/v1/snapshots/:id/restore
   * Trigger restore for a snapshot
   */
  @Post('/:id/restore')
  @OpenAPI({
    summary: 'Restore snapshot',
    description: 'Triggers a restore operation for a snapshot',
    responses: {
      200: { description: 'Restore result' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
      404: { description: 'Snapshot not found' },
      409: { description: 'Restore already in progress' },
    },
  })
  async restoreSnapshot(
    @Param('id') id: string,
    @Body() body: RestoreSnapshotBody,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response
  ) {
    if (!req.user) {
      return ResponseUtil.error(res, ErrorCodes.AUTH_TOKEN_MISSING, 'Not authenticated', 401);
    }

    if (!id || typeof id !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'snapshot id is required', 400);
    }

    const { vaultId, deviceId } = body;

    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(res, ErrorCodes.VALIDATION_ERROR, 'vaultId is required', 400);
    }

    try {
      const result = await this.snapshotService.restoreSnapshot(req.user.id, {
        snapshotId: id,
        deviceId,
      });

      return ResponseUtil.success(res, result);
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      if (error.code === ErrorCodes.RESOURCE_NOT_FOUND) {
        return ResponseUtil.error(res, error.code, error.message, 404);
      }
      if (error.code === ErrorCodes.SYNC_CONFLICT) {
        // Return 409 Conflict with existing task info
        return ResponseUtil.error(res, error.code, error.message, 409, {
          existingTask: error.existingTask,
        });
      }
      if (error.code === ErrorCodes.VALIDATION_ERROR) {
        return ResponseUtil.error(res, error.code, error.message, 400);
      }
      throw error;
    }
  }
}
