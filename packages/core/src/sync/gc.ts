import Database from 'better-sqlite3';
import type { VersionManager } from './version_manager';
import type { S3Adapter } from './adapter';
import type { GcConfig, GcResult } from '@aimo-note/dto';
import { unlinkSync, existsSync, statSync } from 'fs';
import { join } from 'path';

export class GarbageCollector {
  constructor(
    private db: InstanceType<typeof Database>,
    private versionManager: VersionManager,
    private adapter: S3Adapter | null,
    private vaultPath: string,
    private deviceId: string
  ) {}

  gc(config: GcConfig): GcResult {
    const result: GcResult = {
      filesCleaned: [],
      versionsRemoved: 0,
      bytesReclaimed: 0,
      errors: [],
    };

    const maxVersionsPerFile = config.maxVersionsPerFile ?? 10;
    const maxVersionAgeDays = config.maxVersionAgeDays ?? 30;
    const cleanRemote = config.cleanRemote ?? false;

    // Get all tracked file paths
    const filePaths = this.versionManager.getAllTrackedPaths();

    for (const filePath of filePaths) {
      try {
        const removed = this.cleanFileVersions(
          filePath,
          maxVersionsPerFile,
          maxVersionAgeDays,
          cleanRemote,
          result
        );
        if (removed > 0) {
          result.filesCleaned.push(filePath);
          result.versionsRemoved += removed;
        }
      } catch (err) {
        result.errors.push(`gc ${filePath}: ${err}`);
      }
    }

    return result;
  }

  private cleanFileVersions(
    filePath: string,
    maxVersions: number,
    maxAgeDays: number,
    cleanRemote: boolean,
    result: GcResult
  ): number {
    const history = this.versionManager.getFileHistory(filePath);

    if (history.length <= 1) {
      return 0; // Nothing to clean
    }

    const now = new Date();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    // Separate latest from older versions (sorted by created_at DESC)
    // history[0] is the latest
    const older = history.slice(1);

    // Mark versions for deletion:
    // 1. Keep all versions if total is within limit (no GC needed)
    // 2. Otherwise, delete oldest versions beyond maxVersions
    // 3. Additionally delete any version older than maxAgeDays (except latest)
    const toDelete: string[] = [];

    for (const version of older) {
      const age = now.getTime() - new Date(version.createdAt).getTime();
      if (age > maxAgeMs) {
        toDelete.push(version.version);
      }
    }

    // If still within limit after age-based cleanup, apply version count limit
    // Include deleted versions in the count (they still occupy version slots)
    const remaining = older.filter(v => !toDelete.includes(v.version));
    if (remaining.length > maxVersions) {
      // Sort by timestamp DESC (newest first), then id DESC as tiebreaker
      const sortedRemaining = [...remaining].sort((a, b) => {
        const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return Number(b.id ?? 0) - Number(a.id ?? 0);
      });
      // Keep only maxVersions - 1 from older (since latest is already counted in maxVersions)
      const keepCount = maxVersions - 1;
      const excess = sortedRemaining.slice(keepCount);
      for (const v of excess) {
        if (!toDelete.includes(v.version)) {
          toDelete.push(v.version);
        }
      }
    }

    // Perform deletions
    let removed = 0;
    for (const versionStr of toDelete) {
      const versionRecord = this.versionManager.getVersion(filePath, versionStr);
      if (!versionRecord) continue;

      // Delete local file
      const contentPath = versionRecord.contentPath;
      if (existsSync(contentPath)) {
        const { size } = statSync(contentPath);
        result.bytesReclaimed += size;
        unlinkSync(contentPath);
      }

      // Delete JSON metadata file (same path with .json extension)
      const jsonPath = contentPath.replace('.content', '.json');
      if (existsSync(jsonPath)) {
        unlinkSync(jsonPath);
      }

      // Delete from DB
      this.db
        .prepare('DELETE FROM sync_file_versions WHERE file_path = ? AND version = ?')
        .run(filePath, versionStr);

      // Delete from S3 if requested (fire-and-forget, non-blocking)
      if (cleanRemote && this.adapter) {
        this.adapter.deleteObject(`.aimo/versions/${filePath}/${versionStr}.content`).catch((err) => {
          console.warn(`Failed to delete remote version ${filePath}@${versionStr}: ${err}`);
        });
        this.adapter.deleteObject(`.aimo/versions/${filePath}/${versionStr}.json`).catch((err) => {
          console.warn(`Failed to delete remote version ${filePath}@${versionStr}: ${err}`);
        });
      }

      removed++;
    }

    return removed;
  }
}