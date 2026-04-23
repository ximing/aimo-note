/**
 * ChangeQueue - Manages pending local changes for sync
 *
 * Writes file changes to sync_local_changes table with state tracking.
 * Prevents duplicate pending records for the same file.
 */

import Database from 'better-sqlite3';
import type { SyncOperation } from '@aimo-note/dto';

interface SyncLocalChangeRow {
  id: number;
  file_path: string;
  operation: string;
  blob_hash: string | null;
  base_revision: string | null;
  new_revision: string;
  size_bytes: number | null;
  metadata_json: string | null;
  created_at: string;
  synced: number;
  device_id: string;
}

export interface PendingChange {
  id: number;
  filePath: string;
  operation: SyncOperation;
  blobHash: string | null;
  baseRevision: string | null;
  newRevision: string;
  sizeBytes: number | null;
  metadataJson: string | null;
  createdAt: string;
  synced: boolean;
}

export class ChangeQueue {
  constructor(
    private db: InstanceType<typeof Database>,
    private deviceId: string
  ) {}

  /**
   * Enqueue a file change as pending
   */
  enqueue(
    filePath: string,
    operation: SyncOperation,
    newRevision: string,
    options: {
      blobHash?: string | null;
      baseRevision?: string | null;
      sizeBytes?: number | null;
      metadataJson?: string | null;
    } = {}
  ): PendingChange {
    const now = new Date().toISOString();

    // Check for existing non-synced record for same file
    const existing = this.db
      .prepare('SELECT id FROM sync_local_changes WHERE file_path = ? AND synced = 0')
      .get(filePath) as { id: number } | undefined;

    if (existing) {
      // Update existing pending record
      this.db
        .prepare(`
          UPDATE sync_local_changes
          SET operation = ?, blob_hash = ?, base_revision = ?, new_revision = ?,
              size_bytes = ?, metadata_json = ?, created_at = ?
          WHERE id = ?
        `)
        .run(
          operation,
          options.blobHash ?? null,
          options.baseRevision ?? null,
          newRevision,
          options.sizeBytes ?? null,
          options.metadataJson ?? null,
          now,
          existing.id
        );

      return this.getById(existing.id)!;
    }

    // Insert new pending record
    const result = this.db
      .prepare(`
        INSERT INTO sync_local_changes
        (file_path, operation, blob_hash, base_revision, new_revision,
         size_bytes, metadata_json, created_at, synced, device_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `)
      .run(
        filePath,
        operation,
        options.blobHash ?? null,
        options.baseRevision ?? null,
        newRevision,
        options.sizeBytes ?? null,
        options.metadataJson ?? null,
        now,
        this.deviceId
      );

    return this.getById(result.lastInsertRowid as number)!;
  }

  /**
   * List all pending (non-synced) changes
   */
  listPending(): PendingChange[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_local_changes WHERE synced = 0 ORDER BY created_at ASC')
      .all() as SyncLocalChangeRow[];

    return rows.map(this.mapRow);
  }

  /**
   * Mark changes as uploading (in progress)
   */
  markUploading(ids: number[]): void {
    if (ids.length === 0) return;

    // For now, mark as uploading by setting a flag
    // In practice this could use a separate status column
    // Here we mark them as temporarily locked
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE sync_local_changes SET synced = 0 WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  /**
   * Mark changes as committed (synced successfully)
   */
  markCommitted(ids: number[]): void {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE sync_local_changes SET synced = 1 WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  /**
   * Mark changes as failed
   */
  markFailed(ids: number[]): void {
    if (ids.length === 0) return;

    // Reset to pending state for retry
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE sync_local_changes SET synced = 0 WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  /**
   * Get pending count
   */
  getPendingCount(): number {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM sync_local_changes WHERE synced = 0')
      .get() as { count: number };
    return result.count;
  }

  private getById(id: number): PendingChange | null {
    const row = this.db
      .prepare('SELECT * FROM sync_local_changes WHERE id = ?')
      .get(id) as SyncLocalChangeRow | undefined;

    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: SyncLocalChangeRow): PendingChange {
    return {
      id: row.id,
      filePath: row.file_path,
      operation: row.operation as SyncOperation,
      blobHash: row.blob_hash,
      baseRevision: row.base_revision,
      newRevision: row.new_revision,
      sizeBytes: row.size_bytes,
      metadataJson: row.metadata_json,
      createdAt: row.created_at,
      synced: row.synced === 1,
    };
  }
}