import { Controller, Post, Get, Body, Req, Res } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import type { Response } from 'express';
import { VaultService } from '../../services/vault.service.js';
import { ResponseUtil } from '../../utils/response.js';
import { ErrorCodes } from '../../constants/error-codes.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { Service } from 'typedi';

export interface CreateVaultBody {
  name: string;
  description?: string;
}

@Service()
@Controller('/api/v1/vaults')
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  /**
   * POST /api/v1/vaults
   * Create a new vault
   */
  @Post()
  @OpenAPI({
    summary: 'Create vault',
    description: 'Creates a new vault for the authenticated user',
    responses: {
      201: { description: 'Vault created successfully' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
    },
  })
  async createVault(@Body() body: CreateVaultBody, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'Vault name is required',
        400
      );
    }

    try {
      const vault = await this.vaultService.createVault(req.user.id, name.trim(), description);
      return ResponseUtil.created(res, { vault });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      throw error;
    }
  }

  /**
   * GET /api/v1/vaults
   * List user vaults
   */
  @Get()
  @OpenAPI({
    summary: 'List vaults',
    description: 'Returns all vaults the authenticated user has access to',
    responses: {
      200: { description: 'List of vaults' },
      401: { description: 'Not authenticated' },
    },
  })
  async listVaults(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    const vaults = await this.vaultService.getUserVaults(req.user.id);
    return ResponseUtil.success(res, { vaults });
  }
}
