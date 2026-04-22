import mysql from 'mysql2/promise';
import { getConfig } from '../config/config.js';

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    const config = getConfig();
    pool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      connectionLimit: config.mysql.connectionLimit,
      waitForConnections: true,
      queueLimit: 0,
    });
  }
  return pool;
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
