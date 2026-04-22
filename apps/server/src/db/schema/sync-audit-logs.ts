import {
  varchar,
  datetime,
  mysqlTable,
  bigint,
  index,
  text,
} from 'drizzle-orm/mysql-core';

/**
 * Sync audit logs table schema
 * Records audit events for sync operations
 */
export const syncAuditLogs = mysqlTable(
  'sync_audit_logs',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    userId: varchar('user_id', { length: 191 }),
    vaultId: varchar('vault_id', { length: 191 }),
    deviceId: varchar('device_id', { length: 191 }),
    action: varchar('action', { length: 100 }).notNull(),
    requestId: varchar('request_id', { length: 191 }),
    status: varchar('status', { length: 50 }),
    detailJson: text('detail_json'),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_sync_audit_logs_user_id').on(table.userId),
    index('idx_sync_audit_logs_vault_id').on(table.vaultId),
    index('idx_sync_audit_logs_created_at').on(table.createdAt),
  ],
);

export type SyncAuditLog = typeof syncAuditLogs.$inferSelect;
export type NewSyncAuditLog = typeof syncAuditLogs.$inferInsert;
