import {
  varchar,
  datetime,
  mysqlTable,
  index,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';

/**
 * Auth sessions table schema
 * Stores session information for refresh token support
 */
export const authSessions = mysqlTable(
  'auth_sessions',
  {
    id: varchar('id', { length: 191 }).primaryKey(),
    userId: varchar('user_id', { length: 191 }).notNull(),
    deviceName: varchar('device_name', { length: 100 }),
    refreshTokenHash: varchar('refresh_token_hash', { length: 255 }).notNull(),
    expiresAt: datetime('expires_at', { fsp: 3 }).notNull(),
    revokedAt: datetime('revoked_at', { fsp: 3 }),
    createdAt: datetime('created_at', { fsp: 3 }).notNull(),
    updatedAt: datetime('updated_at', { fsp: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_auth_sessions_refresh_token_hash').on(table.refreshTokenHash),
    index('idx_auth_sessions_user_id').on(table.userId),
    index('idx_auth_sessions_expires_at').on(table.expiresAt),
  ],
);

export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
