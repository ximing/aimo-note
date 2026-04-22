import {
  varchar,
  datetime,
  mysqlTable,
  bigint,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Sync commit changes table schema
 * Represents file changes within a sync commit
 */
export const syncCommitChanges = mysqlTable(
  'sync_commit_changes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().autoincrement(),
    commitSeq: bigint('commit_seq', { mode: 'number' }).notNull(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    filePath: varchar('file_path', { length: 1000 }).notNull(),
    op: varchar('op', { length: 50 }).notNull(),
    blobHash: varchar('blob_hash', { length: 191 }),
    baseRevision: varchar('base_revision', { length: 191 }),
    newRevision: varchar('new_revision', { length: 191 }),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    metadataJson: varchar('metadata_json', { length: 2000 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_sync_commit_changes_vault_commit_seq').on(table.vaultId, table.commitSeq),
    index('idx_sync_commit_changes_vault_id_file_path').on(table.vaultId, table.filePath),
  ],
);

export type SyncCommitChange = typeof syncCommitChanges.$inferSelect;
export type NewSyncCommitChange = typeof syncCommitChanges.$inferInsert;
