import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import { getConfig } from '../config/config.js';

/**
 * Run all pending migrations.
 * Uses drizzle-kit migrations from ./drizzle folder.
 */
export async function runMigrations(): Promise<void> {
  const config = getConfig();

  // Create a dedicated connection for migrations
  const connection = await mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
  });

  try {
    const db = drizzle(connection);

    console.log('Running migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations completed successfully');
  } finally {
    await connection.end();
  }
}
