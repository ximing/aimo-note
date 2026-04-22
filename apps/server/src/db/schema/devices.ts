import {
  varchar,
  datetime,
  mysqlTable,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Devices table schema
 * Represents a user's device that can sync with vaults
 */
export const devices = mysqlTable(
  'devices',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    userId: varchar('user_id', { length: 191 }).notNull(),
    name: varchar('name', { length: 255 }),
    platform: varchar('platform', { length: 50 }),
    clientVersion: varchar('client_version', { length: 50 }),
    lastSeenAt: datetime('last_seen_at', { fsp: 3 }),
    revokedAt: datetime('revoked_at', { fsp: 3 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_devices_vault_id').on(table.vaultId),
    index('idx_devices_user_id').on(table.userId),
  ],
);

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
