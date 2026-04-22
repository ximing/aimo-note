import {
  varchar,
  datetime,
  mysqlTable,
  uniqueIndex,
  bigint,
} from 'drizzle-orm/mysql-core';

/**
 * Sync file heads table schema
 * Represents the current head revision for each file in a vault
 */
export const syncFileHeads = mysqlTable(
  'sync_file_heads',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    filePath: varchar('file_path', { length: 1000 }).notNull(),
    headRevision: varchar('head_revision', { length: 191 }).notNull(),
    blobHash: varchar('blob_hash', { length: 191 }),
    lastCommitSeq: bigint('last_commit_seq', { mode: 'number' }).notNull(),
    isDeleted: varchar('is_deleted', { length: 1 }).notNull().default('0'),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_sync_file_heads_vault_id_file_path').on(table.vaultId, table.filePath),
  ],
);

export type SyncFileHead = typeof syncFileHeads.$inferSelect;
export type NewSyncFileHead = typeof syncFileHeads.$inferInsert;
