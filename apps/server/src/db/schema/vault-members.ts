import {
  varchar,
  datetime,
  mysqlTable,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';

/**
 * Vault members table schema
 * Represents a user's membership in a vault
 */
export const vaultMembers = mysqlTable(
  'vault_members',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    vaultId: varchar('vault_id', { length: 191 }).notNull(),
    userId: varchar('user_id', { length: 191 }).notNull(),
    role: varchar('role', { length: 50 }).notNull().default('member'),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_vault_members_vault_id_user_id').on(table.vaultId, table.userId),
  ],
);

export type VaultMember = typeof vaultMembers.$inferSelect;
export type NewVaultMember = typeof vaultMembers.$inferInsert;
