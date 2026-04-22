import { Service } from 'typedi';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import {
  syncDeviceCursors,
} from '../db/schema/sync-device-cursors.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { VaultService } from './vault.service.js';
import { DeviceService, DeviceNotFoundError, DeviceAccessDeniedError } from './device.service.js';
import { AuditService } from './audit.service.js';

export class CursorNotFoundError extends Error {
  code = ErrorCodes.RESOURCE_NOT_FOUND;
  constructor(vaultId: string, deviceId: string) {
    super(`Cursor not found for device ${deviceId} in vault ${vaultId}`);
    this.name = 'CursorNotFoundError';
  }
}

export class CursorOwnershipError extends Error {
  code = ErrorCodes.ACCESS_DENIED;
  constructor(deviceId: string, expectedUserId: string) {
    super(`Device ${deviceId} is not owned by user ${expectedUserId}`);
    this.name = 'CursorOwnershipError';
  }
}

export class CursorRegressionError extends Error {
  code = ErrorCodes.VALIDATION_ERROR;
  constructor(ackedSeq: number, currentSeq: number) {
    super(
      `Cannot acknowledge seq ${ackedSeq} less than current cursor seq ${currentSeq}. Cursors can only advance forward.`
    );
    this.name = 'CursorRegressionError';
  }
}

export interface CursorState {
  vaultId: string;
  deviceId: string;
  lastPulledSeq: number;
  updatedAt: Date;
}

export interface AckParams {
  vaultId: string;
  deviceId: string;
  ackedSeq: number;
  requestId?: string;
}

/**
 * CursorService handles sync device cursor tracking.
 * Tracks the last acknowledged sequence number for each device in each vault.
 */
@Service()
export class CursorService {
  constructor(
    private readonly vaultService: VaultService,
    private readonly deviceService: DeviceService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Get or create a cursor for a device in a vault.
   * If the cursor doesn't exist, returns a virtual cursor with lastPulledSeq = 0.
   * The actual cursor record is created on first ack, which provides the real userId.
   */
  async getOrCreateCursor(vaultId: string, deviceId: string): Promise<CursorState> {
    const db = getDb();

    // Try to find existing cursor
    const existing = await db
      .select()
      .from(syncDeviceCursors)
      .where(and(eq(syncDeviceCursors.vaultId, vaultId), eq(syncDeviceCursors.deviceId, deviceId)))
      .limit(1);

    if (existing.length > 0) {
      return {
        vaultId: existing[0].vaultId,
        deviceId: existing[0].deviceId,
        lastPulledSeq: Number(existing[0].lastPulledSeq),
        updatedAt: existing[0].updatedAt,
      };
    }

    // Return a virtual cursor — do NOT insert with invalid userId placeholder.
    // The actual record with real userId is created on first ack.
    return {
      vaultId,
      deviceId,
      lastPulledSeq: 0,
      updatedAt: new Date(),
    };
  }

  /**
   * Get the current cursor state for a device in a vault.
   * Returns null if no cursor exists.
   */
  async getCursor(vaultId: string, deviceId: string): Promise<CursorState | null> {
    const db = getDb();

    const result = await db
      .select()
      .from(syncDeviceCursors)
      .where(and(eq(syncDeviceCursors.vaultId, vaultId), eq(syncDeviceCursors.deviceId, deviceId)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return {
      vaultId: result[0].vaultId,
      deviceId: result[0].deviceId,
      lastPulledSeq: Number(result[0].lastPulledSeq),
      updatedAt: result[0].updatedAt,
    };
  }

  /**
   * Acknowledge that the client has processed up to a certain sequence number.
   * Only allows advancing the cursor (ackedSeq must be >= current lastPulledSeq).
   *
   * @param userId - The user making the acknowledgment
   * @param params - Ack parameters including vaultId, deviceId, and ackedSeq
   * @throws CursorRegressionError if ackedSeq < current lastPulledSeq
   * @throws CursorOwnershipError if the device doesn't belong to the user
   */
  async ack(userId: string, params: AckParams): Promise<CursorState> {
    const { vaultId, deviceId, ackedSeq } = params;

    // Assert vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    // Assert device ownership
    await this.deviceService.assertDeviceOwnership(userId, deviceId);

    // Check if device is revoked
    const device = await this.deviceService.findById(deviceId);
    if (!device) {
      throw new DeviceNotFoundError(deviceId);
    }
    if (device.revokedAt !== null) {
      throw new DeviceAccessDeniedError(userId, deviceId);
    }

    const db = getDb();
    const now = new Date();

    // Get current cursor state
    const cursor = await this.getCursor(vaultId, deviceId);

    if (cursor === null) {
      // No cursor exists yet - create one with the ackedSeq
      const id = generateId();

      await db.insert(syncDeviceCursors).values({
        id,
        vaultId,
        userId,
        deviceId,
        lastPulledSeq: ackedSeq,
        updatedAt: now,
      });

      logger.info('CursorService.ack created new cursor', {
        userId,
        vaultId,
        deviceId,
        ackedSeq,
      });

      return {
        vaultId,
        deviceId,
        lastPulledSeq: ackedSeq,
        updatedAt: now,
      };
    }

    // Check for regression - ackedSeq must be >= current lastPulledSeq
    if (ackedSeq < cursor.lastPulledSeq) {
      throw new CursorRegressionError(ackedSeq, cursor.lastPulledSeq);
    }

    // If ackedSeq equals current seq, no update needed (idempotent)
    if (ackedSeq === cursor.lastPulledSeq) {
      return cursor;
    }

    // Advance the cursor
    await db
      .update(syncDeviceCursors)
      .set({
        lastPulledSeq: ackedSeq,
        updatedAt: now,
      })
      .where(
        and(eq(syncDeviceCursors.vaultId, vaultId), eq(syncDeviceCursors.deviceId, deviceId))
      );

    logger.info('CursorService.ack advanced cursor', {
      userId,
      vaultId,
      deviceId,
      previousSeq: cursor.lastPulledSeq,
      newSeq: ackedSeq,
    });

    // Audit log for ack
    await this.auditService.logSyncAck(userId, vaultId, deviceId, params.requestId ?? '', {
      status: 'success',
      detail: { previousSeq: cursor.lastPulledSeq, newSeq: ackedSeq },
    });

    return {
      vaultId,
      deviceId,
      lastPulledSeq: ackedSeq,
      updatedAt: now,
    };
  }

  /**
   * Delete a cursor for a device in a vault.
   * Used when a device is revoked or removed from a vault.
   */
  async deleteCursor(vaultId: string, deviceId: string): Promise<void> {
    const db = getDb();

    await db
      .delete(syncDeviceCursors)
      .where(and(eq(syncDeviceCursors.vaultId, vaultId), eq(syncDeviceCursors.deviceId, deviceId)));

    logger.info('CursorService.deleteCursor deleted cursor', { vaultId, deviceId });
  }
}
