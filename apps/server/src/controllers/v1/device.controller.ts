import { Controller, Post, Get, Body, QueryParams, Req, Res } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import type { Response } from 'express';
import { DeviceService } from '../../services/device.service.js';
import { VaultService } from '../../services/vault.service.js';
import { AuditService } from '../../services/audit.service.js';
import { ResponseUtil } from '../../utils/response.js';
import { ErrorCodes } from '../../constants/error-codes.js';
import type { AuthenticatedRequest } from '../../types/express.js';
import { Service } from 'typedi';

export interface RegisterDeviceBody {
  vaultId: string;
  deviceId?: string;
  name?: string;
  platform?: string;
  clientVersion?: string;
}

export interface RevokeDeviceBody {
  deviceId: string;
}

export interface ListDevicesQuery {
  vaultId?: string;
}

@Service()
@Controller('/api/v1/devices')
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly vaultService: VaultService,
    private readonly auditService: AuditService
  ) {}

  /**
   * POST /api/v1/devices/register
   * Register a new device
   */
  @Post('/register')
  @OpenAPI({
    summary: 'Register device',
    description: 'Registers a new device for a vault',
    responses: {
      201: { description: 'Device registered successfully' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied to vault' },
    },
  })
  async registerDevice(@Body() body: RegisterDeviceBody, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    const { vaultId, deviceId, name, platform, clientVersion } = body;

    if (!vaultId || typeof vaultId !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'vaultId is required',
        400
      );
    }

    try {
      const device = await this.deviceService.registerDevice({
        vaultId,
        userId: req.user.id,
        deviceId,
        name,
        platform,
        clientVersion,
      });
      await this.auditService.logDeviceRegister(req.user.id, device.id);
      return ResponseUtil.created(res, { device });
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
   * GET /api/v1/devices?vaultId=x
   * List devices for a vault
   */
  @Get()
  @OpenAPI({
    summary: 'List devices',
    description: 'Returns all devices for a vault',
    responses: {
      200: { description: 'List of devices' },
      401: { description: 'Not authenticated' },
    },
  })
  async listDevices(@QueryParams() query: ListDevicesQuery, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    const { vaultId } = query;

    if (!vaultId) {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'vaultId query parameter is required',
        400
      );
    }

    try {
      // Verify the user has access to the vault
      await this.vaultService.assertVaultOwnership(req.user.id, vaultId);
      const devices = await this.deviceService.listDevicesByVault(vaultId);
      return ResponseUtil.success(res, { devices });
    } catch (error: any) {
      if (error.code === ErrorCodes.ACCESS_DENIED) {
        return ResponseUtil.error(res, error.code, error.message, 403);
      }
      throw error;
    }
  }

  /**
   * POST /api/v1/devices/revoke
   * Revoke a device
   */
  @Post('/revoke')
  @OpenAPI({
    summary: 'Revoke device',
    description: 'Revokes a device by setting revokedAt',
    responses: {
      204: { description: 'Device revoked successfully' },
      400: { description: 'Validation error' },
      401: { description: 'Not authenticated' },
      403: { description: 'Access denied' },
      404: { description: 'Device not found' },
    },
  })
  async revokeDevice(@Body() body: RevokeDeviceBody, @Req() req: AuthenticatedRequest, @Res() res: Response) {
    if (!req.user) {
      return ResponseUtil.error(
        res,
        ErrorCodes.AUTH_TOKEN_MISSING,
        'Not authenticated',
        401
      );
    }

    const { deviceId } = body;

    if (!deviceId || typeof deviceId !== 'string') {
      return ResponseUtil.error(
        res,
        ErrorCodes.VALIDATION_ERROR,
        'deviceId is required',
        400
      );
    }

    try {
      await this.deviceService.revokeDevice(deviceId, req.user.id);
      return ResponseUtil.noContent(res);
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
