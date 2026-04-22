import type { MySql2Database } from 'drizzle-orm/mysql2';

/**
 * Execute a function within a database transaction.
 * The transaction will automatically commit on success or rollback on error.
 *
 * @param db - Drizzle database instance
 * @param fn - Async function that receives the transaction and performs operations
 * @returns The return value of the provided function
 *
 * @example
 * ```ts
 * const result = await withTransaction(db, async (tx) => {
 *   await tx.insert(users).values({ name: 'John' });
 *   await tx.insert(sessions).values({ userId: 1 });
 *   return { success: true };
 * });
 * ```
 */
export async function withTransaction<T>(
  db: MySql2Database,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (tx: any) => Promise<T>
): Promise<T> {
  return db.transaction(fn);
}
