import type { Database } from 'better-sqlite3';
import type { SyncConflictRecord } from '@aimo-note/dto';

function mapRow(row: any): SyncConflictRecord {
  return {
    id: row.id,
    filePath: row.file_path,
    localVersion: row.local_version,
    remoteVersion: row.remote_version,
    localHash: row.local_hash,
    remoteHash: row.remote_hash,
    createdAt: row.created_at,
    resolved: row.resolved === 1,
    resolutionPath: row.resolution_path,
  };
}

export interface RecordConflictInput {
  filePath: string;
  localVersion: string;
  remoteVersion: string;
  localHash: string;
  remoteHash: string;
}

export class ConflictManager {
  constructor(private db: Database) {}

  record(input: RecordConflictInput): SyncConflictRecord {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO sync_conflicts
        (file_path, local_version, remote_version, local_hash, remote_hash, created_at, resolved, resolution_path)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
    `);
    const result = stmt.run(
      input.filePath,
      input.localVersion,
      input.remoteVersion,
      input.localHash,
      input.remoteHash,
      now
    );

    return {
      id: result.lastInsertRowid as number,
      ...input,
      createdAt: now,
      resolved: false,
      resolutionPath: null,
    };
  }

  getUnresolved(): SyncConflictRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_conflicts WHERE resolved = 0 ORDER BY created_at DESC')
      .all() as any[];
    return rows.map(mapRow);
  }

  getUnresolvedForFile(filePath: string): SyncConflictRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_conflicts WHERE file_path = ? AND resolved = 0 ORDER BY created_at DESC')
      .all(filePath) as any[];
    return rows.map(mapRow);
  }

  getById(id: number): SyncConflictRecord | null {
    const row = this.db
      .prepare('SELECT * FROM sync_conflicts WHERE id = ?')
      .get(id) as any;
    return row ? mapRow(row) : null;
  }

  resolve(id: number, resolutionPath: string): void {
    this.db
      .prepare('UPDATE sync_conflicts SET resolved = 1, resolution_path = ? WHERE id = ?')
      .run(resolutionPath, id);
  }

  generateConflictFilename(originalPath: string): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const h = now.getHours();
    const min = now.getMinutes();
    const s = now.getSeconds();
    const dateStr = `${y}${pad(m)}${pad(d)}`;
    const timeStr = `${pad(h)}${pad(min)}${pad(s)}`;
    const rand = Math.random().toString(36).slice(2, 6).toLowerCase();  // 4 random alphanumeric chars

    const basename = originalPath.replace(/\.mdx?$/, '');
    const ext = originalPath.endsWith('.mdx') ? '.mdx' : '.md';

    return `${basename}_conflict_${dateStr}_${timeStr}_${rand}${ext}`;
  }
}
