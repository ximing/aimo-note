import type { Database } from 'better-sqlite3';
import type { SyncConflictRecord, ServerConflict } from '@aimo-note/dto';

function mapRow(row: any): SyncConflictRecord {
  return {
    id: row.id,
    filePath: row.file_path,
    // Canonical ServerConflict fields
    expectedBaseRevision: row.expected_base_revision ?? '',
    actualHeadRevision: row.actual_head_revision ?? '',
    remoteBlobHash: row.remote_blob_hash ?? null,
    winningCommitSeq: row.winning_commit_seq ?? 0,
    // Local auxiliary fields
    localHash: row.local_hash ?? '',
    conflictCopyPath: row.conflict_copy_path ?? undefined,
    createdAt: row.created_at,
    resolved: row.resolved === 1,
    resolutionPath: row.resolution_path,
  };
}

export interface RecordConflictInput {
  filePath: string;
  expectedBaseRevision: string;
  actualHeadRevision: string;
  remoteBlobHash: string | null;
  winningCommitSeq: number;
  localHash: string;
  losingDeviceId?: string;
}

export interface ConflictResolutionInput {
  conflictId: number;
  resolutionPath: string;
}

export class ConflictManager {
  constructor(private db: Database) {}

  /**
   * Record a new conflict from local conflict detection.
   * Uses canonical ServerConflict field names.
   */
  record(input: RecordConflictInput): SyncConflictRecord {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO sync_conflicts
        (file_path, expected_base_revision, actual_head_revision, remote_blob_hash, winning_commit_seq, local_hash, created_at, resolved, resolution_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)
    `);
    const result = stmt.run(
      input.filePath,
      input.expectedBaseRevision,
      input.actualHeadRevision,
      input.remoteBlobHash,
      input.winningCommitSeq,
      input.localHash,
      now
    );

    return {
      id: result.lastInsertRowid as number,
      filePath: input.filePath,
      expectedBaseRevision: input.expectedBaseRevision,
      actualHeadRevision: input.actualHeadRevision,
      remoteBlobHash: input.remoteBlobHash ?? '',
      winningCommitSeq: input.winningCommitSeq,
      localHash: input.localHash,
      conflictCopyPath: undefined,
      createdAt: now,
      resolved: false,
      resolutionPath: null,
    };
  }

  /**
   * Record a conflict from server conflict response.
   * Maps ServerConflict canonical fields to local record.
   */
  recordFromServer(serverConflict: ServerConflict, localHash: string): SyncConflictRecord {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO sync_conflicts
        (file_path, expected_base_revision, actual_head_revision, remote_blob_hash, winning_commit_seq, local_hash, created_at, resolved, resolution_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)
    `);
    const result = stmt.run(
      serverConflict.filePath,
      serverConflict.expectedBaseRevision,
      serverConflict.actualHeadRevision,
      serverConflict.remoteBlobHash,
      serverConflict.winningCommitSeq,
      localHash,
      now
    );

    return {
      id: result.lastInsertRowid as number,
      filePath: serverConflict.filePath,
      expectedBaseRevision: serverConflict.expectedBaseRevision,
      actualHeadRevision: serverConflict.actualHeadRevision,
      remoteBlobHash: serverConflict.remoteBlobHash,
      winningCommitSeq: serverConflict.winningCommitSeq,
      localHash,
      conflictCopyPath: undefined,
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

  /**
   * Mark a conflict as resolved.
   * Idempotent - resolving an already resolved conflict succeeds silently.
   */
  resolve(conflictId: number, resolutionPath: string): void {
    this.db
      .prepare('UPDATE sync_conflicts SET resolved = 1, resolution_path = ? WHERE id = ? AND resolved = 0')
      .run(resolutionPath, conflictId);
  }

  /**
   * Update the conflict copy path for a conflict record.
   */
  updateConflictCopyPath(conflictId: number, conflictCopyPath: string): void {
    this.db
      .prepare('UPDATE sync_conflicts SET conflict_copy_path = ? WHERE id = ?')
      .run(conflictCopyPath, conflictId);
  }

  /**
   * Generate a conflict filename for the original file path.
   * Preserves the directory structure so the conflict file is in the same subdirectory.
   * For "notes/test.md", returns "notes/test_conflict_20260422_143052_abc1.md"
   */
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

    // Extract directory and filename separately
    const lastSlashIndex = originalPath.lastIndexOf('/');
    const dir = lastSlashIndex >= 0 ? originalPath.slice(0, lastSlashIndex + 1) : '';
    const filename = lastSlashIndex >= 0 ? originalPath.slice(lastSlashIndex + 1) : originalPath;

    // Extract actual file extension (last dot followed by non-dot chars, or empty string)
    const dotIndex = filename.lastIndexOf('.');
    const ext = dotIndex > 0 ? filename.slice(dotIndex) : '';

    // Remove extension from filename to get base
    const base = ext ? filename.slice(0, filename.length - ext.length) : filename;

    return `${dir}${base}_conflict_${dateStr}_${timeStr}_${rand}${ext || '.md'}`;
  }
}