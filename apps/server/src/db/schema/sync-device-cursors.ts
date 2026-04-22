import {
  varchar,
  datetime,
  mysqlTable,
  bigint,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';

/**
 * Sync device cursors table schema
 * Tracks the last pulled sequence for each device in each vault
 */
export const syncDeviceCursors = mysqlTable(
  'sync_device_cursors',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    userId: varchar('user_id', { length: 191 }).notNull(),
    deviceId: varchar('device_id', { length: 191 }).notNull(),
    lastPulledSeq: bigint('last_pulled_seq', { mode: 'number' }).notNull().default(0),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_sync_device_cursors_vault_id_device_id').on(table.vaultId, table.deviceId),
  ],
);

export type SyncDeviceCursor = typeof syncDeviceCursors.$inferSelect;
export type NewSyncDeviceCursor = typeof syncDeviceCursors.$inferInsert;
