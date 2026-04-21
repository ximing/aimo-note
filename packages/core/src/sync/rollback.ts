import { VersionManager } from './version_manager';
import type { S3Adapter } from './adapter';
import type { RollbackResult } from '@aimo-note/dto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export class VersionRollback {
  constructor(
    private versionManager: VersionManager,
    private adapter: S3Adapter | null,
    private vaultPath: string
  ) {}

  /**
   * Restore a file to a specific historical version.
   * Creates a new version entry (non-destructive).
   * Falls back to S3 download if the version is not available locally.
   */
  async rollback(filePath: string, targetVersion: string): Promise<RollbackResult> {
    // Step 1: Try to get content from local version store
    let content = this.versionManager.getVersionContent(filePath, targetVersion);

    // Step 2: If not locally available, try to download from S3
    if (content === null && this.adapter) {
      const contentKey = `.aimo/versions/${filePath}/${targetVersion}.content`;
      const remoteContent = await this.adapter.getObject(contentKey);
      if (remoteContent !== null) {
        content = remoteContent;
      }
    }

    // Step 3: If still no content, fail
    if (content === null) {
      throw new Error(`Version ${targetVersion} not found for ${filePath}`);
    }

    // Step 4: Write restored content to the vault file
    const vaultFilePath = join(this.vaultPath, filePath);
    const dir = dirname(vaultFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(vaultFilePath, content, 'utf-8');

    // Step 5: Create a new version entry to record the restoration
    // Use the current latest version as base for increment to avoid duplicate labels
    const currentLatest = this.versionManager.getLatestVersion(filePath);
    const baseVersion = currentLatest ? currentLatest.version : targetVersion;
    const newVersionLabel = this.incrementVersion(baseVersion);
    const hash = VersionManager.computeHash(content);
    const message = `restored from ${targetVersion}`;

    this.versionManager.createVersion(filePath, newVersionLabel, hash, content, message);

    return {
      filePath,
      restoredVersion: targetVersion,
      newVersion: newVersionLabel,
      content,
    };
  }

  /**
   * Increment a version string.
   * Handles v1 → v2, v10 → v11, etc.
   * Also handles bare numbers: 1 → 2, 10 → 11.
   */
  private incrementVersion(version: string): string {
    const match = version.match(/^v?(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10) + 1;
      return `v${num}`;
    }
    // Fallback: append .1
    return `${version}.1`;
  }
}
