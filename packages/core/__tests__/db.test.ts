import { Database } from 'better-sqlite3';
import { initDatabase, getDatabase } from '../src/sync/db';
import type { SyncDevice } from '@aimo-note/dto';

describe('Database', () => {
  const testDb = new Database(':memory:');

  beforeAll(() => {
    initDatabase(testDb);
  });

  it('should create tables', () => {
    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('sync_devices');
    expect(tableNames).toContain('sync_change_log');
    expect(tableNames).toContain('sync_file_versions');
  });

  it('should register and retrieve device', () => {
    const device: SyncDevice = {
      id: 'test-device-001',
      name: 'Test MacBook',
      lastSeen: '2026-04-20T10:00:00Z',
      createdAt: '2026-04-20T10:00:00Z',
    };

    const stmt = testDb.prepare(`
      INSERT OR REPLACE INTO sync_devices (id, name, last_seen, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(device.id, device.name, device.lastSeen, device.createdAt);

    const result = testDb
      .prepare('SELECT * FROM sync_devices WHERE id = ?')
      .get(device.id) as any;

    expect(result.id).toBe(device.id);
    expect(result.name).toBe(device.name);
  });
});
