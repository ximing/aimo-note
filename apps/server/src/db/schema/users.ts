import {
  varchar,
  datetime,
  mysqlTable,
} from 'drizzle-orm/mysql-core';

/**
 * Users table schema
 * Stores user account information for authentication
 */
export const users = mysqlTable(
  'users',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    username: varchar('username', { length: 100 }).notNull(),
    avatar: varchar('avatar', { length: 500 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
  },
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
