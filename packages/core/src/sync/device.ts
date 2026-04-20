import Database from 'better-sqlite3';
import type { SyncDevice } from '@aimo-note/dto';
import { randomUUID } from 'crypto';

export class DeviceManager {
  constructor(private db: InstanceType<typeof Database>) {}

  register(id: string, name: string): SyncDevice {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sync_devices (id, name, last_seen, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, name, now, now);

    return { id, name, lastSeen: now, createdAt: now };
  }

  getDevice(id: string): SyncDevice | null {
    const row = this.db
      .prepare('SELECT * FROM sync_devices WHERE id = ?')
      .get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
    };
  }

  getAllDevices(): SyncDevice[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_devices ORDER BY last_seen DESC')
      .all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
    }));
  }

  touch(id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE sync_devices SET last_seen = ? WHERE id = ?')
      .run(now, id);
  }

  generateDeviceId(): string {
    return `device-${randomUUID().slice(0, 8)}`;
  }
}