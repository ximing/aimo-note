import {
  varchar,
  datetime,
  mysqlTable,
  index,
  bigint,
} from 'drizzle-orm/mysql-core';

/**
 * Sync conflicts table schema
 * Records detected sync conflicts between devices
 */
export const syncConflicts = mysqlTable(
  'sync_conflicts',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    userId: varchar('user_id', { length: 191 }).notNull(),
    filePath: varchar('file_path', { length: 1000 }).notNull(),
    losingDeviceId: varchar('losing_device_id', { length: 191 }),
    winningRevision: varchar('winning_revision', { length: 191 }),
    losingRevision: varchar('losing_revision', { length: 191 }),
    actualHeadRevision: varchar('actual_head_revision', { length: 191 }),
    remoteBlobHash: varchar('remote_blob_hash', { length: 191 }),
    winningCommitSeq: bigint('winning_commit_seq', { mode: 'number' }).notNull(),
    resolutionPath: varchar('resolution_path', { length: 1000 }),
    resolvedAt: datetime('resolved_at', { fsp: 3 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_sync_conflicts_vault_id').on(table.vaultId),
    index('idx_sync_conflicts_user_id').on(table.userId),
  ],
);

export type SyncConflict = typeof syncConflicts.$inferSelect;
export type NewSyncConflict = typeof syncConflicts.$inferInsert;
