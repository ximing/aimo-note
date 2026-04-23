import {
  varchar,
  datetime,
  mysqlTable,
  bigint,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Sync tombstones table schema
 * Records deleted files that need to be propagated to clients
 */
export const syncTombstones = mysqlTable(
  'sync_tombstones',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    filePath: varchar('file_path', { length: 1000 }).notNull(),
    deleteCommitSeq: bigint('delete_commit_seq', { mode: 'number' }).notNull(),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_sync_tombstones_vault_id').on(table.vaultId),
    index('idx_sync_tombstones_vault_id_created_at').on(table.vaultId, table.createdAt),
  ],
);

export type SyncTombstone = typeof syncTombstones.$inferSelect;
export type NewSyncTombstone = typeof syncTombstones.$inferInsert;
