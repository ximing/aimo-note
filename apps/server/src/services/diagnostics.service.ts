import { Service } from 'typedi';
import { eq, and, gt, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import {
  syncDiagnostics,
  syncRuntimeEvents,
  type NewSyncDiagnostic,
  type NewSyncRuntimeEvent,
} from '../db/schema/sync-diagnostics.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { VaultService } from './vault.service.js';
import { DeviceService } from './device.service.js';
import type { SyncTrigger, SyncDiagnostics, SyncRuntimeEvent } from '@aimo-note/dto';

export class DiagnosticsNotFoundError extends Error {
  code = ErrorCodes.RESOURCE_NOT_FOUND;
  constructor(vaultId: string, deviceId: string) {
    super(`Diagnostics not found for vault ${vaultId} and device ${deviceId}`);
    this.name = 'DiagnosticsNotFoundError';
  }
}

export interface DiagnosticsParams {
  vaultId: string;
  deviceId: string;
}

export interface RecordEventParams {
  vaultId: string;
  deviceId: string;
  trigger: SyncTrigger;
  retryCount: number;
  offlineStartedAt?: string | null;
  recoveredAt?: string | null;
  nextRetryAt?: string | null;
  requestId: string;
}

/**
 * DiagnosticsService handles sync diagnostics and runtime event operations.
 *
 * Key behaviors:
 * - Idempotency: events with same requestId+deviceId+trigger are deduplicated within 24h
 * - Offline replay semantics: events captured offline are stored and can be replayed
 * - Ownership verification: all operations verify user vault/device ownership
 */
@Service()
export class DiagnosticsService {
  constructor(
    private readonly vaultService: VaultService,
    private readonly deviceService: DeviceService,
  ) {}

  /**
   * Get sync diagnostics for a vault+device combination.
   * Returns diagnostics from the server as single source of truth for cross-device facts.
   * Local device state supplements cross-device facts when available.
   */
  async getSyncDiagnostics(userId: string, params: DiagnosticsParams): Promise<SyncDiagnostics> {
    const { vaultId, deviceId } = params;

    // Verify vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    // Verify device ownership (device belongs to this vault and user has access)
    await this.deviceService.assertDeviceOwnership(userId, vaultId, deviceId);

    const db = getDb();

    // Get the latest diagnostics record for this vault+device
    const result = await db
      .select()
      .from(syncDiagnostics)
      .where(and(eq(syncDiagnostics.vaultId, vaultId), eq(syncDiagnostics.deviceId, deviceId)))
      .limit(1);

    if (result.length === 0) {
      // Return empty diagnostics if none exist
      return {
        lastTriggerSource: null,
        offlineReason: null,
        nextRetryAt: null,
        lastFailedRequestId: null,
        lastFailedRequestDeviceId: null,
        lastSuccessfulSyncAt: null,
        consecutiveFailures: 0,
      };
    }

    const record = result[0];

    return {
      lastTriggerSource: (record.lastTriggerSource as SyncTrigger) ?? null,
      offlineReason: record.offlineReason ?? null,
      nextRetryAt: record.nextRetryAt?.toISOString() ?? null,
      lastFailedRequestId: record.lastFailedRequestId ?? null,
      lastFailedRequestDeviceId: record.lastFailedRequestDeviceId ?? null,
      lastSuccessfulSyncAt: record.lastSuccessfulSyncAt?.toISOString() ?? null,
      consecutiveFailures: Number(record.consecutiveFailures) || 0,
    };
  }

  /**
   * Record a sync runtime event.
   *
   * Idempotency: combination of requestId + deviceId + trigger forms the idempotency key.
   * Events with the same idempotency key within a 24h window are deduplicated.
   *
   * Offline replay: events are stored with occurredAt timestamp for later replay.
   */
  async recordSyncRuntimeEvent(
    userId: string,
    params: RecordEventParams
  ): Promise<{ accepted: boolean; deduplicated: boolean }> {
    const { vaultId, deviceId, trigger, retryCount, offlineStartedAt, recoveredAt, nextRetryAt, requestId } = params;

    // Verify vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();
    const now = new Date();

    // Check for duplicate event (idempotency key: requestId + deviceId + trigger)
    const existing = await db
      .select()
      .from(syncRuntimeEvents)
      .where(
        and(
          eq(syncRuntimeEvents.requestId, requestId),
          eq(syncRuntimeEvents.deviceId, deviceId),
          eq(syncRuntimeEvents.trigger, trigger)
        )
      )
      .limit(1);

    let deduplicated = false;
    let eventId: string;

    if (existing.length > 0) {
      // Event already exists - mark as deduplicated but don't create duplicate
      deduplicated = true;
      eventId = existing[0].id;

      logger.debug('SyncRuntimeEvent deduplicated', { eventId, requestId, deviceId, trigger });
    } else {
      // Create new event record
      eventId = generateId();

      const newEvent: NewSyncRuntimeEvent = {
        id: eventId,
        vaultId,
        deviceId,
        trigger,
        retryCount: retryCount,
        offlineStartedAt: offlineStartedAt ? new Date(offlineStartedAt) : null,
        recoveredAt: recoveredAt ? new Date(recoveredAt) : null,
        nextRetryAt: nextRetryAt ? new Date(nextRetryAt) : null,
        requestId,
        occurredAt: now,
        deduplicatedAt: null,
      };

      await db.insert(syncRuntimeEvents).values(newEvent);

      logger.info('SyncRuntimeEvent recorded', { eventId, requestId, deviceId, trigger });
    }

    // Update the diagnostics snapshot with the latest event data
    await this.upsertDiagnostics(userId, {
      vaultId,
      deviceId,
      trigger,
      retryCount,
      offlineStartedAt,
      recoveredAt,
      nextRetryAt,
      requestId,
    });

    return { accepted: true, deduplicated };
  }

  /**
   * Upsert (update or insert) the diagnostics snapshot atomically.
   * Uses INSERT ... ON DUPLICATE KEY UPDATE to avoid race conditions.
   * Called after each runtime event to keep diagnostics current.
   */
  private async upsertDiagnostics(
    _userId: string,
    params: {
      vaultId: string;
      deviceId: string;
      trigger: SyncTrigger;
      retryCount: number;
      offlineStartedAt?: string | null;
      recoveredAt?: string | null;
      nextRetryAt?: string | null;
      requestId: string;
    }
  ): Promise<void> {
    const { vaultId, deviceId, trigger, retryCount, offlineStartedAt, recoveredAt, nextRetryAt, requestId } = params;

    const db = getDb();
    const now = new Date();

    // Determine offline reason based on state transitions
    let offlineReason: string | null = null;
    if (offlineStartedAt && !recoveredAt) {
      offlineReason = 'connection_lost';
    } else if (recoveredAt) {
      offlineReason = null; // Recovered
    }

    // Calculate consecutive failures
    const consecutiveFailures = retryCount > 0 ? retryCount : 0;

    const diagnosticId = generateId();
    const newDiagnostic: NewSyncDiagnostic = {
      id: diagnosticId,
      vaultId,
      deviceId,
      lastTriggerSource: trigger,
      offlineReason,
      offlineStartedAt: offlineStartedAt ? new Date(offlineStartedAt) : null,
      recoveredAt: recoveredAt ? new Date(recoveredAt) : null,
      nextRetryAt: nextRetryAt ? new Date(nextRetryAt) : null,
      retryCount: retryCount,
      lastFailedRequestId: retryCount > 0 ? requestId : null,
      lastFailedRequestDeviceId: retryCount > 0 ? deviceId : null,
      lastSuccessfulSyncAt: retryCount === 0 ? now : null,
      consecutiveFailures: consecutiveFailures,
      updatedAt: now,
      createdAt: now,
    };

    // Use atomic upsert with ON DUPLICATE KEY UPDATE to avoid race conditions
    // The unique index on (vaultId, deviceId) ensures atomic upsert behavior
    // Use sql template tag to reference columns for "keep current value" semantics
    await db
      .insert(syncDiagnostics)
      .values(newDiagnostic)
      .onDuplicateKeyUpdate({
        set: {
          lastTriggerSource: trigger,
          offlineReason,
          offlineStartedAt: offlineStartedAt ? new Date(offlineStartedAt) : sql`${syncDiagnostics.offlineStartedAt}`,
          recoveredAt: recoveredAt ? new Date(recoveredAt) : sql`${syncDiagnostics.recoveredAt}`,
          nextRetryAt: nextRetryAt ? new Date(nextRetryAt) : sql`${syncDiagnostics.nextRetryAt}`,
          retryCount: retryCount,
          lastFailedRequestId: retryCount > 0 ? requestId : sql`${syncDiagnostics.lastFailedRequestId}`,
          lastFailedRequestDeviceId: retryCount > 0 ? deviceId : sql`${syncDiagnostics.lastFailedRequestDeviceId}`,
          consecutiveFailures: consecutiveFailures,
          lastSuccessfulSyncAt: retryCount === 0 ? now : sql`${syncDiagnostics.lastSuccessfulSyncAt}`,
          updatedAt: now,
        },
      });
  }

  /**
   * Get runtime events for a vault (for debugging/auditing).
   */
  async getRuntimeEvents(
    userId: string,
    vaultId: string,
    options?: { limit?: number; since?: string }
  ): Promise<SyncRuntimeEvent[]> {
    // Verify vault ownership
    await this.vaultService.assertVaultOwnership(userId, vaultId);

    const db = getDb();

    // Build query conditions
    const conditions = [eq(syncRuntimeEvents.vaultId, vaultId)];

    // Apply 'since' filter if provided
    if (options?.since) {
      const sinceDate = new Date(options.since);
      conditions.push(gt(syncRuntimeEvents.occurredAt, sinceDate));
    }

    let query = db
      .select()
      .from(syncRuntimeEvents)
      .where(and(...conditions))
      .orderBy(syncRuntimeEvents.occurredAt) // Most recent events first
      .limit(options?.limit ?? 100); // Default limit of 100

    const result = await query;

    return result.map((row) => ({
      trigger: row.trigger as SyncTrigger,
      retryCount: row.retryCount ?? 0,
      offlineStartedAt: row.offlineStartedAt?.toISOString() ?? null,
      recoveredAt: row.recoveredAt?.toISOString() ?? null,
      nextRetryAt: row.nextRetryAt?.toISOString() ?? null,
      requestId: row.requestId,
      deviceId: row.deviceId,
      occurredAt: row.occurredAt.toISOString(),
    }));
  }
}