import {
  varchar,
  datetime,
  mysqlTable,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Vaults table schema
 * Represents a user's vault container
 */
export const vaults = mysqlTable(
  'vaults',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    ownerUserId: varchar('owner_user_id', { length: 191 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 1000 }),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    index('idx_vaults_owner_user_id').on(table.ownerUserId),
  ],
);

export type Vault = typeof vaults.$inferSelect;
export type NewVault = typeof vaults.$inferInsert;
