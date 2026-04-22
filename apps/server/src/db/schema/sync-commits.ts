import {
  varchar,
  datetime,
  mysqlTable,
  bigint,
  index,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';

/**
 * Sync commits table schema
 * Represents a commit in the sync log
 */
export const syncCommits = mysqlTable(
  'sync_commits',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().autoincrement(),
    id: varchar('id', { length: 191 }).notNull().unique(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    userId: varchar('user_id', { length: 191 }).notNull(),
    deviceId: varchar('device_id', { length: 191 }).notNull(),
    requestId: varchar('request_id', { length: 191 }).notNull(),
    baseSeq: bigint('base_seq', { mode: 'number' }),
    changeCount: bigint('change_count', { mode: 'number' }).notNull().default(0),
    summary: varchar('summary', { length: 500 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_sync_commits_vault_id_seq').on(table.vaultId, table.seq),
    uniqueIndex('idx_sync_commits_vault_id_request_id').on(table.vaultId, table.requestId),
  ],
);

export type SyncCommit = typeof syncCommits.$inferSelect;
export type NewSyncCommit = typeof syncCommits.$inferInsert;
