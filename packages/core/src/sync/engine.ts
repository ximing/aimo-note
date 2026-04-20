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

    // Step 1: Load remote changelog (before manifest per sync protocol)
    let remoteChangelog: any[] = [];
    try {
      const changelogRaw = await this.adapter.getChangelog();
      if (changelogRaw) {
        try {
          remoteChangelog = JSON.parse(changelogRaw);
        } catch {
          remoteChangelog = [];
        }
      }
    } catch (err) {
      result.errors.push(`getChangelog: ${err}`);
    }

    // Step 2: Load remote manifest
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
        const version = remoteManifest.files[filePath]?.version;
        if (!version) {
          result.errors.push(`download ${filePath}: no version in remote manifest`);
          continue;
        }
        await this.downloadVersion(filePath, version);
        result.downloaded.push(filePath);
      } catch (err) {
        result.errors.push(`download ${filePath}: ${err}`);
      }
    }

    // Step 6: Persist merged manifest so other devices see these changes
    let markSyncedIds: number[] = [];
    if (result.uploaded.length > 0) {
      const entries = this.changeLogger.getUnsyncedEntries();
      const uploadedEntries = entries.filter((e) => result.uploaded.includes(e.filePath));
      markSyncedIds = uploadedEntries.map((e) => e.id!).filter(Boolean);
    }

    try {
      if (result.uploaded.length > 0 || result.downloaded.length > 0 || result.conflicts.length > 0) {
        // Start from a shallow copy of remoteManifest so we don't drop remote-only files
        const finalManifest: SyncManifest = { ...remoteManifest };
        // Merge in latest local version for each uploaded file
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
        // Merge in authoritative remote state for each downloaded file
        for (const filePath of result.downloaded) {
          const remoteEntry = remoteManifest.files[filePath];
          if (remoteEntry) {
            finalManifest.files[filePath] = remoteEntry;
          }
        }
        await this.manifestManager.save(finalManifest);

        // Mark change log entries as synced only after manifest save succeeds
        if (markSyncedIds.length > 0) {
          this.changeLogger.markSynced(markSyncedIds);
        }
      } else {
        // No changes to persist — still mark synced if we uploaded nothing but have IDs
        // (can happen when all files conflicted and nothing was uploaded)
        if (markSyncedIds.length > 0) {
          this.changeLogger.markSynced(markSyncedIds);
        }
      }
    } catch (err) {
      result.errors.push(`manifest save: ${err}`);
    }

    // Step 7: Save remote changelog (last step of exchange)
    // Merge remote changelog with our local unsynced entries and push back
    try {
      const localEntries = this.changeLogger.getUnsyncedEntries();
      const mergedChangelog = [...remoteChangelog];
      for (const entry of localEntries) {
        mergedChangelog.push(entry);
      }
      await this.adapter.putChangelog(JSON.stringify(mergedChangelog, null, 2));
    } catch (err) {
      result.errors.push(`putChangelog: ${err}`);
    }

    return result;
  }

  async buildLocalManifest(): Promise<SyncManifest> {
    const manifest: SyncManifest = {
      version: '1',
      updatedAt: new Date().toISOString(),
      deviceId: this.deviceId,
      files: {},
    };

    // Get ALL tracked file paths from the version manager (not just unsynced)
    const filePaths = this.versionManager.getAllTrackedPaths();

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
    if (!latest) {
      throw new Error(`No local version found for ${filePath}`);
    }

    const content = this.versionManager.getVersionContent(filePath, latest.version);
    if (content === null) {
      throw new Error(`Version content is null for ${filePath}@${latest.version}`);
    }

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
    let meta: {
      hash: string;
      version: string;
      createdAt: string;
      deviceId: string;
      message: string;
    };
    if (metaRaw) {
      try {
        meta = JSON.parse(metaRaw);
      } catch {
        meta = {
          hash: '',
          version,
          createdAt: new Date().toISOString(),
          deviceId: this.deviceId,
          message: '',
        };
      }
    } else {
      meta = {
        hash: '',
        version,
        createdAt: new Date().toISOString(),
        deviceId: this.deviceId,
        message: '',
      };
    }

    this.versionManager.createVersion(filePath, version, meta.hash ?? '', content, meta.message ?? '');
  }
}
