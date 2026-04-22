import { Service } from 'typedi';
import { eq, and, isNull } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { devices, type Device, type NewDevice } from '../db/schema/devices.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { VaultService } from './vault.service.js';

export class DeviceNotFoundError extends Error {
  code = ErrorCodes.RESOURCE_NOT_FOUND;
  constructor(deviceId: string) {
    super(`Device not found: ${deviceId}`);
    this.name = 'DeviceNotFoundError';
  }
}

export class DeviceAccessDeniedError extends Error {
  code = ErrorCodes.ACCESS_DENIED;
  constructor(userId: string, deviceId: string) {
    super(`Access denied: user ${userId} does not have access to device ${deviceId}`);
    this.name = 'DeviceAccessDeniedError';
  }
}

export interface RegisterDeviceParams {
  vaultId: string;
  userId: string;
  deviceId?: string;
  name?: string;
  platform?: string;
  clientVersion?: string;
}

@Service()
export class DeviceService {
  constructor(private readonly vaultService: VaultService) {}

  /**
   * Register a new device with lastSeenAt refresh
   */
  async registerDevice(params: RegisterDeviceParams): Promise<Device> {
    const { vaultId, userId, deviceId: clientDeviceId, name, platform, clientVersion } = params;
    const db = getDb();
    const now = new Date();
    const deviceId = clientDeviceId ?? generateId();

    // Assert vault ownership to ensure user has access
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const newDevice: NewDevice = {
      id: deviceId,
      vaultId,
      userId,
      name: name ?? null,
      platform: platform ?? null,
      clientVersion: clientVersion ?? null,
      lastSeenAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(devices).values(newDevice);

    logger.info('Device registered', { deviceId, vaultId, userId, platform });

    // Return the created device
    const createdDevice = await this.findById(deviceId);
    return createdDevice!;
  }

  /**
   * List devices for a vault (non-revoked)
   */
  async listDevicesByVault(vaultId: string): Promise<Device[]> {
    const db = getDb();

    const result = await db
      .select()
      .from(devices)
      .where(and(eq(devices.vaultId, vaultId), isNull(devices.revokedAt)));

    return result;
  }

  /**
   * Find device by ID
   */
  async findById(deviceId: string): Promise<Device | null> {
    const db = getDb();
    const result = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Refresh device lastSeenAt timestamp
   */
  async refreshLastSeen(deviceId: string): Promise<void> {
    const db = getDb();
    const now = new Date();

    await db
      .update(devices)
      .set({ lastSeenAt: now, updatedAt: now })
      .where(eq(devices.id, deviceId));
  }

  /**
   * Revoke a device (set revokedAt)
   */
  async revokeDevice(deviceId: string, userId: string): Promise<void> {
    const db = getDb();
    const now = new Date();

    // Find the device to verify ownership
    const device = await this.findById(deviceId);
    if (!device) {
      throw new DeviceNotFoundError(deviceId);
    }

    // Assert that the user owns the vault the device belongs to
    await this.vaultService.assertVaultOwnership(userId, device.vaultId);

    await db
      .update(devices)
      .set({ revokedAt: now, updatedAt: now })
      .where(eq(devices.id, deviceId));

    logger.info('Device revoked', { deviceId, userId });
  }

  /**
   * Assert that a user has access to a device and the device belongs to the specified vault
   * Throws DeviceAccessDeniedError if not
   */
  async assertDeviceOwnership(userId: string, vaultId: string, deviceId: string): Promise<void> {
    const device = await this.findById(deviceId);
    if (!device) {
      throw new DeviceNotFoundError(deviceId);
    }

    // Verify device belongs to the specified vault
    if (device.vaultId !== vaultId) {
      throw new DeviceAccessDeniedError(userId, deviceId);
    }

    await this.vaultService.assertVaultOwnership(userId, vaultId);
  }

  /**
   * List devices for a user across all vaults (non-revoked)
   */
  async listDevicesByUser(userId: string): Promise<Device[]> {
    const db = getDb();

    const result = await db
      .select()
      .from(devices)
      .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)));

    return result;
  }
}
