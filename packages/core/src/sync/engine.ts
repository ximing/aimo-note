// packages/core/src/sync/engine.ts
import type { S3Adapter } from './adapter';
import type { VersionManager } from './version_manager';
import type { ChangeLogger } from './change_logger';
import type { SyncManifest } from '@aimo-note/dto';
import { ManifestManager } from './manifest';

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
    private deviceId: string
  ) {
    this.manifestManager = new ManifestManager(adapter, deviceId);
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

    // Step 4: Upload local versions (skip on conflict)
    for (const filePath of toUpload) {
      if (conflicts.includes(filePath)) continue;
      try {
        await this.uploadVersion(filePath);
        result.uploaded.push(filePath);
      } catch (err) {
        result.errors.push(`upload ${filePath}: ${err}`);
      }
    }

    // Step 5: Download remote versions
    for (const filePath of toDownload) {
      try {
        const version = remoteManifest.files[filePath].version;
        await this.downloadVersion(filePath, version);
        result.downloaded.push(filePath);
      } catch (err) {
        result.errors.push(`download ${filePath}: ${err}`);
      }
    }

    // Step 6: Mark change log entries as synced for uploaded files
    if (result.uploaded.length > 0) {
      const entries = this.changeLogger.getUnsyncedEntries();
      const uploadedEntries = entries.filter((e) => result.uploaded.includes(e.filePath));
      const ids = uploadedEntries.map((e) => e.id!).filter(Boolean);
      this.changeLogger.markSynced(ids);
    }

    // Step 7: Persist local manifest to remote so other devices see these changes
    // Only save if there were actual uploads or downloads (not just conflicts)
    if (result.uploaded.length > 0 || result.downloaded.length > 0) {
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
      await this.manifestManager.save(finalManifest);
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

    // Get all unique file paths from the change log
    const unsyncedEntries = this.changeLogger.getUnsyncedEntries();
    const filePaths = [...new Set(unsyncedEntries.map((e) => e.filePath))];

    // For each file, get the latest version from VersionManager
    for (const filePath of filePaths) {
      const latest = this.versionManager.getLatestVersion(filePath);
      if (latest) {
        manifest.files[filePath] = {
          hash: latest.hash,
          version: latest.version,
          updatedAt: latest.createdAt,
        };
      }
    }

    return manifest;
  }

  private async uploadVersion(filePath: string): Promise<void> {
    const latest = this.versionManager.getLatestVersion(filePath);
    if (!latest) return;

    const content = this.versionManager.getVersionContent(filePath, latest.version);
    if (content === null) return;

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
  }
}
