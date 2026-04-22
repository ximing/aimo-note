import {
  varchar,
  datetime,
  mysqlTable,
  bigint,
  uniqueIndex,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Blobs table schema
 * Stores file content blobs with deduplication support
 */
export const blobs = mysqlTable(
  'blobs',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    blobHash: varchar('blob_hash', { length: 191 }).notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    mimeType: varchar('mime_type', { length: 255 }),
    refCount: bigint('ref_count', { mode: 'number' }).notNull().default(1),
    createdByUserId: varchar('created_by_user_id', { length: 191 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_blobs_vault_id_blob_hash').on(table.vaultId, table.blobHash),
    index('idx_blobs_vault_id').on(table.vaultId),
  ],
);

export type Blob = typeof blobs.$inferSelect;
export type NewBlob = typeof blobs.$inferInsert;
