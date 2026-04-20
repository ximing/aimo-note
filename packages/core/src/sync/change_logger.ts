import Database from 'better-sqlite3';
import type { SyncChangeLogEntry, SyncOperation } from '@aimo-note/dto';

interface SyncChangeLogRow {
  id: number;
  operation: string;
  file_path: string;
  version: string;
  hash: string | null;
  created_at: string;
  device_id: string;
  synced: number;
}

export class ChangeLogger {
  constructor(
    private db: InstanceType<typeof Database>,
    private deviceId: string
  ) {}

  logUpsert(filePath: string, version: string, hash: string): SyncChangeLogEntry {
    return this.log('upsert', filePath, version, hash);
  }

  logDelete(filePath: string, version: string, hash: string | null): SyncChangeLogEntry {
    return this.log('delete', filePath, version, hash);
  }

  private log(
    operation: SyncOperation,
    filePath: string,
    version: string,
    hash: string | null
  ): SyncChangeLogEntry {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO sync_change_log
        (operation, file_path, version, hash, created_at, device_id, synced)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `);
    const result = stmt.run(operation, filePath, version, hash, now, this.deviceId);

    return {
      id: result.lastInsertRowid as number,
      operation,
      filePath,
      version,
      hash,
      createdAt: now,
      deviceId: this.deviceId,
      synced: false,
    };
  }

  getUnsyncedEntries(): SyncChangeLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_change_log WHERE synced = 0 ORDER BY created_at ASC')
      .all() as SyncChangeLogRow[];

    return rows.map(this.mapRow);
  }

  getEntriesSince(since: string): SyncChangeLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_change_log WHERE created_at > ? ORDER BY created_at ASC')
      .all(since) as SyncChangeLogRow[];

    return rows.map(this.mapRow);
  }

  getEntriesForFile(filePath: string): SyncChangeLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_change_log WHERE file_path = ? ORDER BY created_at ASC')
      .all(filePath) as SyncChangeLogRow[];

    return rows.map(this.mapRow);
  }

  markSynced(ids: number[]): void {
    if (ids.length === 0) return;

    const invalidId = ids.find((id) => typeof id !== 'number' || Number.isNaN(id));
    if (invalidId !== undefined) {
      throw new Error(`markSynced expects an array of valid numbers, got: ${ids}`);
    }

    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE sync_change_log SET synced = 1 WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  private mapRow(row: SyncChangeLogRow): SyncChangeLogEntry {
    return {
      id: row.id,
      operation: row.operation as SyncOperation,
      filePath: row.file_path,
      version: row.version,
      hash: row.hash,
      createdAt: row.created_at,
      deviceId: row.device_id,
      synced: row.synced === 1,
    };
  }
}
