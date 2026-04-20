// packages/core/src/sync/manifest.ts
import type { S3Adapter } from './adapter';
import type { SyncManifest, SyncManifestFileEntry } from '@aimo-note/dto';

export class ManifestManager {
  constructor(
    private adapter: S3Adapter,
    private deviceId: string
  ) {}

  async load(): Promise<SyncManifest> {
    const raw = await this.adapter.getObject('.aimo/manifest.json');
    if (!raw) {
      return this.emptyManifest();
    }
    try {
      return JSON.parse(raw) as SyncManifest;
    } catch {
      return this.emptyManifest();
    }
  }

  async save(manifest: SyncManifest): Promise<void> {
    const json = JSON.stringify(manifest, null, 2);
    await this.adapter.putObject('.aimo/manifest.json', json);
  }

  async updateEntry(
    filePath: string,
    hash: string,
    version: string,
    isDeleted = false
  ): Promise<void> {
    const manifest = await this.load();
    manifest.files[filePath] = {
      hash,
      version,
      updatedAt: new Date().toISOString(),
      isDeleted,
    };
    manifest.updatedAt = new Date().toISOString();
    await this.save(manifest);
  }

  async removeEntry(filePath: string, hash: string): Promise<void> {
    await this.updateEntry(filePath, hash, '', true);
  }

  async getEntry(filePath: string): Promise<SyncManifestFileEntry | null> {
    const manifest = await this.load();
    return manifest.files[filePath] ?? null;
  }

  diff(
    local: SyncManifest,
    remote: SyncManifest
  ): { toUpload: string[]; toDownload: string[]; conflicts: string[] } {
    const localFiles = Object.keys(local.files);
    const remoteFiles = Object.keys(remote.files);
    const allFiles = new Set([...localFiles, ...remoteFiles]);

    const toUpload: string[] = [];
    const toDownload: string[] = [];
    const conflicts: string[] = [];

    for (const file of allFiles) {
      const localEntry = local.files[file];
      const remoteEntry = remote.files[file];

      if (!localEntry && remoteEntry) {
        toDownload.push(file);
      } else if (localEntry && !remoteEntry) {
        toUpload.push(file);
      } else if (localEntry && remoteEntry) {
        if (localEntry.hash !== remoteEntry.hash) {
          conflicts.push(file);
        } else if (localEntry.version !== remoteEntry.version) {
          toUpload.push(file);
        }
      }
    }

    return { toUpload, toDownload, conflicts };
  }

  private emptyManifest(): SyncManifest {
    return {
      version: '1',
      updatedAt: new Date().toISOString(),
      deviceId: this.deviceId,
      files: {},
    };
  }
}
