import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { getConfig } from '../config/config.js';

let pool: mysql.Pool | null = null;
let dbInstance: MySql2Database | null = null;

/** Shared pool options extracted from config to avoid duplication */
function getPoolOptions() {
  const config = getConfig();
  return {
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    connectionLimit: config.mysql.connectionLimit,
    waitForConnections: true,
    queueLimit: 0,
  };
}

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(getPoolOptions());
  }
  return pool;
}

/**
 * Get Drizzle ORM database instance.
 * Wraps the shared mysql2 connection pool from getPool().
 */
export function getDb(): MySql2Database {
  if (!dbInstance) {
    dbInstance = drizzle(getPool());
  }
  return dbInstance;
}

export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const connection = await getPool().getConnection();
    await connection.ping();
    connection.release();
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}
