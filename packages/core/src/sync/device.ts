import Database from 'better-sqlite3';
import type { SyncDevice } from '@aimo-note/dto';
import { randomUUID } from 'crypto';

interface SyncDeviceRow {
  id: string;
  name: string;
  last_seen: string;
  created_at: string;
}

export class DeviceManager {
  constructor(private db: InstanceType<typeof Database>) {}

  register(id: string, name: string): SyncDevice {
    if (!id || !name) {
      throw new Error('Device id and name must be non-empty strings');
    }
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
      .get(id) as SyncDeviceRow | undefined;

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
      .all() as SyncDeviceRow[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
    }));
  }

  touch(id: string): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare('UPDATE sync_devices SET last_seen = ? WHERE id = ?')
      .run(now, id);
    return result.changes > 0;
  }

  generateDeviceId(): string {
    return `device-${randomUUID().slice(0, 8)}`;
  }
}