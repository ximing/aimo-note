// packages/core/src/sync/manifest_compactor.ts
import type { S3Adapter } from './adapter';
import type { ManifestManager } from './manifest';
import type { SyncManifest } from '@aimo-note/dto';
import type { ManifestCompactionResult } from '@aimo-note/dto';

export class ManifestCompactor {
  constructor(
    private adapter: S3Adapter,
    private manifestManager: ManifestManager
  ) {}

  /**
   * Prune stale entries from the remote manifest.
   * Removes entries that are:
   * 1. Marked as isDeleted
   * 2. AND older than maxAgeDays
   * Keeps all non-deleted entries regardless of age.
   */
  async compact(options: { maxAgeDays: number }): Promise<ManifestCompactionResult> {
    const { maxAgeDays } = options;
    const manifest = await this.manifestManager.load();
    const sizeBefore = JSON.stringify(manifest).length;

    const now = new Date();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    let entriesRemoved = 0;

    // Remove entries that are:
    // 1. Marked as isDeleted
    // 2. AND older than maxAgeDays
    for (const [filePath, entry] of Object.entries(manifest.files)) {
      if (entry.isDeleted) {
        const age = now.getTime() - new Date(entry.updatedAt).getTime();
        if (age > maxAgeMs) {
          delete manifest.files[filePath];
          entriesRemoved++;
        }
      }
    }

    const sizeAfter = JSON.stringify(manifest).length;

    if (entriesRemoved > 0) {
      manifest.updatedAt = now.toISOString();
      await this.manifestManager.save(manifest);
    }

    return {
      entriesRemoved,
      sizeBefore,
      sizeAfter,
    };
  }
}