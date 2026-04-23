import {
  varchar,
  datetime,
  mysqlTable,
  bigint,
  index,
  text,
} from 'drizzle-orm/mysql-core';

/**
 * Snapshot status enum values
 */
export const SNAPSHOT_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

export type SnapshotStatus = (typeof SNAPSHOT_STATUS)[keyof typeof SNAPSHOT_STATUS];

/**
 * Snapshots table schema
 * Records vault snapshots for backup/restore functionality
 */
export const snapshots = mysqlTable(
  'snapshots',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    userId: varchar('user_id', { length: 191 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default(SNAPSHOT_STATUS.PENDING),
    baseSeq: bigint('base_seq', { mode: 'number' }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    description: varchar('description', { length: 500 }),
    /** Commit seq restored from this snapshot (if applicable) */
    restoredCommitSeq: bigint('restored_commit_seq', { mode: 'number' }),
    /** Reason for failure if status is 'failed' */
    failureReason: text('failure_reason'),
    /** Final commit seq after restore completes */
    finalCommitSeq: bigint('final_commit_seq', { mode: 'number' }),
    finishedAt: datetime('finished_at', { fsp: 3 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_snapshots_vault_id_status').on(table.vaultId, table.status),
    index('idx_snapshots_vault_id_created_at').on(table.vaultId, table.createdAt),
    index('idx_snapshots_user_id').on(table.userId),
  ],
);

export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
