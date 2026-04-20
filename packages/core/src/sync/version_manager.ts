import Database from 'better-sqlite3';
import type { SyncFileVersion } from '@aimo-note/dto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

interface SyncFileVersionRow {
  id: number;
  file_path: string;
  version: string;
  hash: string;
  content_path: string;
  created_at: string;
  device_id: string;
  message: string;
  is_deleted: number;
}

export class VersionManager {
  private versionsRoot: string;

  constructor(
    private db: InstanceType<typeof Database>,
    private deviceId: string,
    versionsRoot: string
  ) {
    this.versionsRoot = versionsRoot;
  }

  createVersion(
    filePath: string,
    version: string,
    hash: string,
    content: string,
    message = ''
  ): SyncFileVersion {
    if (!filePath || !version || !hash) {
      throw new Error('filePath, version, and hash are required');
    }

    const now = new Date().toISOString();
    const contentPath = this.getContentPath(filePath, version);

    // Ensure directory exists (recursive: true is idempotent, no existsSync check needed)
    const dir = join(this.versionsRoot, filePath);
    mkdirSync(dir, { recursive: true });

    // Write content file
    writeFileSync(contentPath, content, 'utf-8');

    // Insert record
    const stmt = this.db.prepare(`
      INSERT INTO sync_file_versions
        (file_path, version, hash, content_path, created_at, device_id, message, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);
    const result = stmt.run(filePath, version, hash, contentPath, now, this.deviceId, message);

    return {
      id: result.lastInsertRowid,
      filePath,
      version,
      hash,
      contentPath,
      createdAt: now,
      deviceId: this.deviceId,
      message,
      isDeleted: false,
    };
  }

  getFileHistory(filePath: string): SyncFileVersion[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sync_file_versions WHERE file_path = ? ORDER BY created_at DESC, id DESC'
      )
      .all(filePath) as SyncFileVersionRow[];

    return rows.map((row) => this.mapRow(row));
  }

  getAllTrackedPaths(): string[] {
    const rows = this.db
      .prepare(
        'SELECT DISTINCT file_path FROM sync_file_versions WHERE is_deleted = 0'
      )
      .all() as { file_path: string }[];
    return rows.map((row) => row.file_path);
  }

  getLatestVersion(filePath: string): SyncFileVersion | null {
    const row = this.db
      .prepare(
        'SELECT * FROM sync_file_versions WHERE file_path = ? AND is_deleted = 0 ORDER BY created_at DESC, id DESC LIMIT 1'
      )
      .get(filePath) as SyncFileVersionRow | undefined;

    if (!row) return null;
    return this.mapRow(row);
  }

  getVersion(filePath: string, version: string): SyncFileVersion | null {
    const row = this.db
      .prepare('SELECT * FROM sync_file_versions WHERE file_path = ? AND version = ?')
      .get(filePath, version) as SyncFileVersionRow | undefined;

    if (!row) return null;
    return this.mapRow(row);
  }

  getVersionContent(filePath: string, version: string): string | null {
    const versionRecord = this.getVersion(filePath, version);
    if (!versionRecord) return null;

    try {
      return readFileSync(versionRecord.contentPath, 'utf-8');
    } catch (err) {
      console.error(`Failed to read version content for ${filePath}@${version}:`, err);
      return null;
    }
  }

  markDeleted(filePath: string, version: string, hash: string): SyncFileVersion {
    if (!filePath || !version || !hash) {
      throw new Error('filePath, version, and hash are required');
    }

    const now = new Date().toISOString();
    const contentPath = this.getContentPath(filePath, version);

    // Ensure directory exists (recursive: true is idempotent, no existsSync check needed)
    const dir = join(this.versionsRoot, filePath);
    mkdirSync(dir, { recursive: true });

    // Write placeholder for deleted file
    writeFileSync(contentPath, '', 'utf-8');

    const stmt = this.db.prepare(`
      INSERT INTO sync_file_versions
        (file_path, version, hash, content_path, created_at, device_id, message, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, 'deleted', 1)
    `);
    const result = stmt.run(filePath, version, hash, contentPath, now, this.deviceId);

    return {
      id: result.lastInsertRowid,
      filePath,
      version,
      hash,
      contentPath,
      createdAt: now,
      deviceId: this.deviceId,
      message: 'deleted',
      isDeleted: true,
    };
  }

  private getContentPath(filePath: string, version: string): string {
    return join(this.versionsRoot, filePath, `${version}.content`);
  }

  private mapRow(row: SyncFileVersionRow): SyncFileVersion {
    return {
      id: row.id,
      filePath: row.file_path,
      version: row.version,
      hash: row.hash,
      contentPath: row.content_path,
      createdAt: row.created_at,
      deviceId: row.device_id,
      message: row.message,
      isDeleted: row.is_deleted === 1,
    };
  }

  static computeHash(content: string): string {
    return 'sha256:' + createHash('sha256').update(content).digest('hex');
  }
}
