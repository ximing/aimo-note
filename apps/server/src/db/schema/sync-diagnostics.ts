import {
  varchar,
  datetime,
  int,
  mysqlTable,
  index,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';

/**
 * Sync diagnostics table schema
 * Stores the current sync diagnostic state per vault/device combination.
 * Updated on each sync runtime event and periodically on sync status changes.
 */
export const syncDiagnostics = mysqlTable(
  'sync_diagnostics',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    deviceId: varchar('device_id', { length: 191 }).notNull(),
    // Last trigger source (from SyncTrigger type)
    lastTriggerSource: varchar('last_trigger_source', { length: 50 }),
    // Offline state
    offlineReason: varchar('offline_reason', { length: 500 }),
    offlineStartedAt: datetime('offline_started_at', { fsp: 3 }),
    // Recovery tracking
    recoveredAt: datetime('recovered_at', { fsp: 3 }),
    // Retry info
    nextRetryAt: datetime('next_retry_at', { fsp: 3 }),
    retryCount: int('retry_count').default(0),
    // Last failed request context
    lastFailedRequestId: varchar('last_failed_request_id', { length: 191 }),
    lastFailedRequestDeviceId: varchar('last_failed_request_device_id', { length: 191 }),
    // Success tracking
    lastSuccessfulSyncAt: datetime('last_successful_sync_at', { fsp: 3 }),
    consecutiveFailures: int('consecutive_failures').default(0),
    // Metadata
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    // One record per vault+device combination
    uniqueIndex('idx_sync_diagnostics_vault_device').on(table.vaultId, table.deviceId),
    index('idx_sync_diagnostics_vault_id').on(table.vaultId),
  ],
);

export type SyncDiagnostic = typeof syncDiagnostics.$inferSelect;
export type NewSyncDiagnostic = typeof syncDiagnostics.$inferInsert;

/**
 * Sync runtime events table schema
 * Stores individual sync runtime events for diagnostics and offline replay.
 *
 * Idempotency key: combination of `requestId` + `deviceId` + `trigger`
 * Deduplication: events with the same idempotency key within a 24h window are deduplicated
 * Offline replay: events captured while offline are replayed on reconnection
 */
export const syncRuntimeEvents = mysqlTable(
  'sync_runtime_events',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    deviceId: varchar('device_id', { length: 191 }).notNull(),
    // Trigger source (matches SyncTrigger type)
    trigger: varchar('trigger', { length: 50 }).notNull(),
    // Retry info
    retryCount: int('retry_count').default(0),
    // Offline tracking
    offlineStartedAt: datetime('offline_started_at', { fsp: 3 }),
    recoveredAt: datetime('recovered_at', { fsp: 3 }),
    nextRetryAt: datetime('next_retry_at', { fsp: 3 }),
    // Request context
    requestId: varchar('request_id', { length: 191 }).notNull(),
    // Event timestamp
    occurredAt: datetime('occurred_at', { fsp: 3 }).notNull(),
    // Deduplication: set to occurredAt if not a duplicate
    deduplicatedAt: datetime('deduplicated_at', { fsp: 3 }),
  },
  (table) => [
    // Index for querying events by vault
    index('idx_sync_runtime_events_vault_id').on(table.vaultId),
    // Unique index for idempotency: requestId + deviceId + trigger
    // Events within 24h with same idempotency key are considered duplicates
    uniqueIndex('idx_sync_runtime_events_idempotency').on(
      table.requestId,
      table.deviceId,
      table.trigger
    ),
  ],
);

export type SyncRuntimeEvent = typeof syncRuntimeEvents.$inferSelect;
export type NewSyncRuntimeEvent = typeof syncRuntimeEvents.$inferInsert;