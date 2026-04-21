// packages/core/src/sync/engine.ts
import type { S3Adapter } from './adapter';
import type { VersionManager } from './version_manager';
import type { ChangeLogger } from './change_logger';
import type { SyncManifest } from '@aimo-note/dto';
import { ManifestManager } from './manifest';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import type { ConflictManager } from './conflicts';

export interface SyncResult {
  uploaded: string[];
  downloaded: string[];
  conflicts: string[];
  errors: string[];
}

export class SyncEngine {
  private manifestManager: ManifestManager;

  constructor(
    private adapter: S3Adapter,
    private versionManager: VersionManager,
    private changeLogger: ChangeLogger,
    private deviceId: string,
    private conflictManager?: ConflictManager,
    private vaultPath?: string
  ) {
    this.manifestManager = new ManifestManager(adapter, deviceId);
  }

  /**
   * On conflict: save the remote version to a conflict-rename file on disk,
   * and record the conflict in the SQLite conflicts table.
   * The local version stays at the original path (current device wins locally).
   */
  private async createConflictFile(filePath: string, remoteVersion: string): Promise<string> {
    if (!this.conflictManager) {
      return filePath;
    }

    if (!this.vaultPath) {
      throw new Error('vaultPath is required for conflict file creation');
    }

    const contentKey = `.aimo/versions/${filePath}/${remoteVersion}.content`;
    const content = await this.adapter.getObject(contentKey);
    if (!content) return filePath;

    const conflictFilename = this.conflictManager.generateConflictFilename(filePath);
    const conflictPath = join(this.vaultPath, conflictFilename);

    // Write remote version to conflict file
    const dir = dirname(conflictPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(conflictPath, content, 'utf-8');

    return conflictFilename;
  }

  async sync(): Promise<SyncResult> {
    const result: SyncResult = { uploaded: [], downloaded: [], conflicts: [], errors: [] };

    // Step 1: Load remote manifest
    const remoteManifest = await this.manifestManager.load();

    // Step 2: Build local manifest from VersionManager
    const localManifest = await this.buildLocalManifest();

    // Step 3: Diff
    const { toUpload, toDownload, conflicts } = this.manifestManager.diff(localManifest, remoteManifest);
    result.conflicts.push(...conflicts);

    // Step 4: Handle conflicts — record to SQLite, create conflict rename files, upload local version
    for (const filePath of conflicts) {
      const remoteEntry = remoteManifest.files[filePath];
      if (!remoteEntry) continue;

      const localEntry = this.versionManager.getLatestVersion(filePath);

      // Record the conflict in SQLite
      if (this.conflictManager) {
        const record = this.conflictManager.record({
          filePath,
          localVersion: localEntry?.version ?? '',
          remoteVersion: remoteEntry.version,
          localHash: localEntry?.hash ?? '',
          remoteHash: remoteEntry.hash,
        });

        // Write the remote version to a conflict rename file
        const conflictFilename = await this.createConflictFile(filePath, remoteEntry.version);
        // Mark the conflict as resolved with the conflict filename
        this.conflictManager.resolve(record.id, conflictFilename);
      }

      // Upload the local version to S3 (so both versions exist remotely)
      try {
        const ok = await this.uploadVersion(filePath);
        if (ok) result.uploaded.push(filePath);
      } catch (err) {
        result.errors.push(`upload ${filePath}: ${err}`);
      }
    }

    // Step 5: Upload local versions (only non-conflicting files)
    for (const filePath of toUpload) {
      if (conflicts.includes(filePath)) continue;  // skip already-handled conflicts
      try {
        const ok = await this.uploadVersion(filePath);
        if (ok) result.uploaded.push(filePath);
      } catch (err) {
        result.errors.push(`upload ${filePath}: ${err}`);
      }
    }

    // Step 6: Download remote versions
    for (const filePath of toDownload) {
      try {
        const remoteEntry = remoteManifest.files[filePath];
        const version = remoteEntry.version;

        // Check if we already have a local version with a different hash (silent conflict)
        const localLatest = this.versionManager.getLatestVersion(filePath);
        if (localLatest && localLatest.hash !== remoteEntry.hash) {
          // Silent conflict: remote changed while we had local changes
          // Record it and save local version to a conflict file before overwriting
          if (this.conflictManager) {
            const conflictFilename = this.conflictManager.generateConflictFilename(filePath);
            // Save local version to conflict file
            const localContent = this.versionManager.getVersionContent(filePath, localLatest.version);
            if (localContent !== null) {
              const vaultPath = this.vaultPath ?? '';
              const conflictPath = join(vaultPath, conflictFilename);
              const dir = dirname(conflictPath);
              if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
              writeFileSync(conflictPath, localContent, 'utf-8');
            }
            // Record the conflict
            const record = this.conflictManager.record({
              filePath,
              localVersion: localLatest.version,
              remoteVersion: version,
              localHash: localLatest.hash,
              remoteHash: remoteEntry.hash,
            });
            // Mark as resolved with the conflict filename (use record.id, not a second query)
            this.conflictManager.resolve(record.id, conflictFilename);
          }
        }

        if (remoteEntry.isDeleted) {
          // Propagate remote deletion to local: mark deleted in version manager, do NOT write to vault
          this.versionManager.markDeleted(filePath, version, remoteEntry.hash);
          result.downloaded.push(filePath);
        } else {
          await this.downloadVersion(filePath, version);
          result.downloaded.push(filePath);
        }
      } catch (err) {
        result.errors.push(`download ${filePath}: ${err}`);
      }
    }

    // Step 7: Mark change log entries as synced for uploaded files
    if (result.uploaded.length > 0) {
      const entries = this.changeLogger.getUnsyncedEntries();
      const uploadedEntries = entries.filter((e) => result.uploaded.includes(e.filePath));
      const ids = uploadedEntries.map((e) => e.id!).filter(Boolean);
      this.changeLogger.markSynced(ids);
    }

    // Step 8: Persist local manifest to remote so other devices see these changes
    // Save if there were uploads, downloads, or conflicts (conflicts create records other devices must see)
    if (result.uploaded.length > 0 || result.downloaded.length > 0 || result.conflicts.length > 0) {
      const finalManifest = await this.buildLocalManifest();
      // Include files that were just uploaded/downloaded in this sync cycle
      for (const filePath of result.uploaded) {
        const latest = this.versionManager.getLatestVersion(filePath);
        if (latest) {
          finalManifest.files[filePath] = {
            hash: latest.hash,
            version: latest.version,
            updatedAt: latest.createdAt,
          };
        }
      }
      for (const filePath of result.downloaded) {
        const latest = this.versionManager.getLatestVersion(filePath);
        if (latest) {
          finalManifest.files[filePath] = {
            hash: latest.hash,
            version: latest.version,
            updatedAt: latest.createdAt,
          };
        }
      }
      try {
        await this.manifestManager.save(finalManifest);
      } catch (err) {
        result.errors.push(`manifest save: ${err}`);
      }
    }

    return result;
  }

  async buildLocalManifest(): Promise<SyncManifest> {
    // Phase 2: Build manifest from VersionManager
    // This queries the local database for all file versions
    // In Phase 3, this will be enhanced with vault file scanning
    const manifest: SyncManifest = {
      version: '1',
      updatedAt: new Date().toISOString(),
      deviceId: this.deviceId,
      files: {},
    };

    // Get all tracked file paths from the version manager database
    const filePaths = this.versionManager.getAllTrackedPaths();

    // For each file, get the latest version from VersionManager
    for (const filePath of filePaths) {
      const latest = this.versionManager.getLatestVersion(filePath);
      if (latest) {
        manifest.files[filePath] = {
          hash: latest.hash,
          version: latest.version,
          updatedAt: latest.createdAt,
          isDeleted: latest.isDeleted,
        };
      }
    }

    return manifest;
  }

  private async uploadVersion(filePath: string): Promise<boolean> {
    const latest = this.versionManager.getLatestVersion(filePath);
    if (!latest) return false;

    const content = this.versionManager.getVersionContent(filePath, latest.version);
    if (content === null) return false;

    // Upload content
    const contentKey = `.aimo/versions/${filePath}/${latest.version}.content`;
    await this.adapter.putObject(contentKey, content);

    // Upload version metadata
    const meta = {
      hash: latest.hash,
      version: latest.version,
      createdAt: latest.createdAt,
      deviceId: latest.deviceId,
      message: latest.message,
    };
    const metaKey = `.aimo/versions/${filePath}/${latest.version}.json`;
    await this.adapter.putObject(metaKey, JSON.stringify(meta));

    return true;
  }

  private async downloadVersion(filePath: string, version: string): Promise<void> {
    const contentKey = `.aimo/versions/${filePath}/${version}.content`;
    const content = await this.adapter.getObject(contentKey);
    if (!content) return;

    const metaKey = `.aimo/versions/${filePath}/${version}.json`;
    const metaRaw = await this.adapter.getObject(metaKey);
    const meta = metaRaw ? JSON.parse(metaRaw) : {
      hash: '',
      version,
      createdAt: new Date().toISOString(),
      deviceId: this.deviceId,
      message: '',
    };

    this.versionManager.createVersion(filePath, version, meta.hash ?? '', content, meta.message ?? '');

    // Write the downloaded content to the vault path
    if (this.vaultPath) {
      const vaultFilePath = join(this.vaultPath, filePath);
      const dir = dirname(vaultFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(vaultFilePath, content, 'utf-8');
    }
  }
}
