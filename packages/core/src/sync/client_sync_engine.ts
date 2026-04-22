/**
 * ClientSyncEngine - Server-mediated sync orchestration with state machine
 *
 * This engine handles the happy path sync flow:
 * 1. hasBlobs -> check what needs upload
 * 2. upload -> upload missing blobs to presigned URLs
 * 3. commit -> commit changes to server
 * 4. pull -> pull changes from server
 * 5. ack -> acknowledge processed changes
 *
 * State Machine:
 * - DISABLED: Sync not configured or logged out
 * - IDLE: No pending changes, waiting for trigger
 * - PENDING: Changes pending, waiting to sync
 * - SYNCING: Currently syncing
 * - OFFLINE: Network unavailable
 * - ERROR: Sync error occurred
 */

import type { ServerAdapter } from './server_adapter';
import type { BlobUploader } from './blob_uploader';
import type { VersionManager } from './version_manager';
import type { ChangeLogger } from './change_logger';
import type { ConflictManager } from './conflicts';
import type {
  SyncStatus,
  SyncTrigger,
  SyncChangeInput,
  PullResponse,
} from '@aimo-note/dto';

export interface ClientSyncEngineConfig {
  serverAdapter: ServerAdapter;
  blobUploader: BlobUploader;
  versionManager: VersionManager;
  changeLogger: ChangeLogger;
  conflictManager?: ConflictManager;
  deviceId: string;
  vaultId: string;
  vaultPath?: string;
  // Callbacks
  onStatusChange?: (status: SyncStatus, reason?: string) => void;
  onProgress?: (stage: string, progress: number, total: number) => void;
  onError?: (error: Error) => void;
}

export interface ClientSyncResult {
  uploaded: string[];
  downloaded: string[];
  conflicts: string[];
  errors: string[];
}

export class ClientSyncEngine {
  private status: SyncStatus = 'DISABLED';
  private lastSyncAt: string | null = null;
  private lastError: string | null = null;
  private pendingQueue: SyncChangeInput[] = [];
  private isOnline = true;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private config: ClientSyncEngineConfig) {}

  // =============================================================================
  // Status Management
  // =============================================================================

  getStatus(): SyncStatus {
    return this.status;
  }

  getLastSyncAt(): string | null {
    return this.lastSyncAt;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getPendingCount(): number {
    return this.pendingQueue.length;
  }

  isEnabled(): boolean {
    return this.status !== 'DISABLED';
  }

  private setStatus(status: SyncStatus, reason?: string): void {
    if (this.status !== status) {
      this.status = status;
      this.config.onStatusChange?.(status, reason);
    }
  }

  // =============================================================================
  // Lifecycle
  // =============================================================================

  /**
   * Enable sync and optionally trigger initial sync
   */
  async enable(trigger: SyncTrigger = 'startup'): Promise<void> {
    this.setStatus('IDLE', 'enabled');
    await this.sync(trigger);
  }

  /**
   * Disable sync and preserve pending queue
   */
  disable(): void {
    this.stopPeriodicSync();
    this.setStatus('DISABLED', 'disabled');
  }

  /**
   * Start periodic background sync (every 5 minutes)
   */
  startPeriodicSync(intervalMs = 5 * 60 * 1000): void {
    this.stopPeriodicSync();
    this.periodicTimer = setInterval(() => {
      this.sync('periodic_poll').catch((err) => {
        console.error('[ClientSyncEngine] Periodic sync failed:', err);
      });
    }, intervalMs);
  }

  /**
   * Stop periodic background sync
   */
  stopPeriodicSync(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  // =============================================================================
  // Online/Offline Detection
  // =============================================================================

  /**
   * Set online status (call when network status changes)
   */
  setOnline(online: boolean): void {
    const wasOffline = !this.isOnline;
    this.isOnline = online;

    if (online && wasOffline) {
      this.setStatus('IDLE', 'network recovered');
      this.sync('network_recovery').catch((err) => {
        console.error('[ClientSyncEngine] Network recovery sync failed:', err);
      });
    } else if (!online) {
      this.setStatus('OFFLINE', 'network lost');
    }
  }

  // =============================================================================
  // Sync Trigger
  // =============================================================================

  /**
   * Trigger a sync
   */
  async sync(trigger: SyncTrigger = 'manual'): Promise<ClientSyncResult> {
    if (this.status === 'DISABLED') {
      return { uploaded: [], downloaded: [], conflicts: [], errors: ['Sync is disabled'] };
    }

    if (this.status === 'SYNCING') {
      return { uploaded: [], downloaded: [], conflicts: [], errors: ['Sync already in progress'] };
    }

    if (!this.isOnline) {
      this.setStatus('OFFLINE', 'network unavailable');
      return { uploaded: [], downloaded: [], conflicts: [], errors: ['Network is offline'] };
    }

    this.setStatus('SYNCING', trigger);
    const result: ClientSyncResult = { uploaded: [], downloaded: [], conflicts: [], errors: [] };

    try {
      // Step 1: Build pending changes from change logger
      const pendingChanges = await this.buildPendingChanges();
      this.pendingQueue = pendingChanges;

      if (pendingChanges.length > 0) {
        this.setStatus('PENDING', `${pendingChanges.length} pending changes`);
      }

      // Step 2: Check which blobs exist and upload missing ones
      this.config.onProgress?.('upload', 0, 1);
      const uploadResult = await this.uploadBlobs();
      result.uploaded.push(...uploadResult.uploaded);
      result.errors.push(...uploadResult.errors);
      this.config.onProgress?.('upload', 1, 1);

      // Step 3: Commit changes to server
      this.config.onProgress?.('commit', 0, 1);
      const commitResult = await this.commitChanges(pendingChanges);
      result.errors.push(...commitResult.errors);
      this.config.onProgress?.('commit', 1, 1);

      // Step 4: Pull changes from server
      this.config.onProgress?.('pull', 0, 1);
      const pullResult = await this.pullChanges();
      result.downloaded.push(...pullResult.downloaded);
      result.conflicts.push(...pullResult.conflicts);
      result.errors.push(...pullResult.errors);
      this.config.onProgress?.('pull', 1, 1);

      // Step 5: Acknowledge processed changes
      this.config.onProgress?.('ack', 0, 1);
      await this.acknowledgeChanges();
      this.config.onProgress?.('ack', 1, 1);

      // Success
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      this.setStatus('IDLE', 'sync completed');

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastError = errorMessage;
      result.errors.push(errorMessage);
      this.setStatus('ERROR', errorMessage);
      this.config.onError?.(error instanceof Error ? error : new Error(errorMessage));
      return result;
    }
  }

  // =============================================================================
  // Step 1: Build Pending Changes
  // =============================================================================

  private async buildPendingChanges(): Promise<SyncChangeInput[]> {
    const unsyncedEntries = this.config.changeLogger.getUnsyncedEntries();
    const changes: SyncChangeInput[] = [];

    for (const entry of unsyncedEntries) {
      const latestVersion = this.config.versionManager.getLatestVersion(entry.filePath);
      if (!latestVersion) continue;

      const blobHash = latestVersion.hash;
      const content = this.config.versionManager.getVersionContent(entry.filePath, latestVersion.version);

      changes.push({
        filePath: entry.filePath,
        op: entry.operation === 'delete' ? 'delete' : 'upsert',
        blobHash: blobHash,
        baseRevision: null, // Will be determined by server
        newRevision: latestVersion.version,
        sizeBytes: content ? new Blob([content]).size : null,
        metadataJson: null,
      });
    }

    return changes;
  }

  // =============================================================================
  // Step 2: Upload Blobs
  // =============================================================================

  private async uploadBlobs(): Promise<{ uploaded: string[]; errors: string[] }> {
    const uploaded: string[] = [];
    const errors: string[] = [];

    // Collect blob hashes from pending changes
    const blobHashes = new Set<string>();
    for (const change of this.pendingQueue) {
      if (change.blobHash) {
        blobHashes.add(change.blobHash);
      }
    }

    if (blobHashes.size === 0) {
      return { uploaded, errors };
    }

    try {
      // Prepare blobs to upload
      const blobsToUpload = await this.prepareBlobsToUpload(Array.from(blobHashes));

      // Upload missing blobs
      const result = await this.config.blobUploader.uploadMissingBlobs(
        this.config.vaultId,
        blobsToUpload
      );

      uploaded.push(...result.uploaded);
      for (const failure of result.failed) {
        errors.push(`Blob upload failed for ${failure.blobHash}: ${failure.error}`);
      }
    } catch (error) {
      errors.push(`Blob upload error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { uploaded, errors };
  }

  private async prepareBlobsToUpload(blobHashes: string[]): Promise<Array<{
    blobHash: string;
    content: ArrayBuffer;
    mimeType: string;
    sizeBytes: number;
  }>> {
    const blobs = [];

    for (const blobHash of blobHashes) {
      // Find the file that has this blob hash
      const filePaths = this.config.versionManager.getAllTrackedPaths();
      for (const filePath of filePaths) {
        const latestVersion = this.config.versionManager.getLatestVersion(filePath);
        if (latestVersion && latestVersion.hash === blobHash) {
          const content = this.config.versionManager.getVersionContent(filePath, latestVersion.version);
          if (content) {
            const encoder = new TextEncoder();
            const buffer = encoder.encode(content);
            blobs.push({
              blobHash,
              content: buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength
              ),
              mimeType: 'text/markdown',
              sizeBytes: buffer.byteLength,
            });
            break;
          }
        }
      }
    }

    return blobs;
  }

  // =============================================================================
  // Step 3: Commit Changes
  // =============================================================================

  private async commitChanges(changes: SyncChangeInput[]): Promise<{ errors: string[] }> {
    const errors: string[] = [];

    if (changes.length === 0) {
      return { errors };
    }

    try {
      const requestId = `${Date.now()}-${this.config.deviceId}`;
      const response = await this.config.serverAdapter.commit({
        vaultId: this.config.vaultId,
        deviceId: this.config.deviceId,
        requestId,
        baseSeq: null, // Will be determined by server
        changes,
      });

      if (!response.accepted) {
        errors.push(`Commit not accepted: ${response.reason ?? 'Unknown reason'}`);
      }

      // Handle conflicts from server
      if (response.conflicts && response.conflicts.length > 0) {
        for (const conflict of response.conflicts) {
          if (this.config.conflictManager) {
            // Record the conflict
            const record = this.config.conflictManager.record({
              filePath: conflict.filePath,
              localVersion: '', // TODO: Get from pending change
              remoteVersion: conflict.actualHeadRevision,
              localHash: '',
              remoteHash: conflict.remoteBlobHash,
            });
            console.log(`[ClientSyncEngine] Recorded conflict for ${conflict.filePath}:`, record);
          }
        }
      }
    } catch (error) {
      errors.push(`Commit failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { errors };
  }

  // =============================================================================
  // Step 4: Pull Changes
  // =============================================================================

  private async pullChanges(): Promise<{
    downloaded: string[];
    conflicts: string[];
    errors: string[];
  }> {
    const downloaded: string[] = [];
    const conflicts: string[] = [];
    const errors: string[] = [];

    try {
      // Get last known sequence number (from local storage or cursor)
      const sinceSeq = 0; // TODO: Persist and retrieve last acked sequence

      const response = await this.config.serverAdapter.pull(
        this.config.vaultId,
        sinceSeq,
        100 // limit
      );

      // Process commits and changes
      for (const commit of response.commits) {
        for (const change of commit.changes) {
          try {
            if (change.op === 'delete') {
              // Handle deletion
              this.config.versionManager.markDeleted(
                change.filePath,
                change.newRevision ?? commit.commitSeq.toString(),
                change.blobHash ?? ''
              );
              downloaded.push(change.filePath);
            } else if (change.blobHash) {
              // Download blob and create version
              const blobResult = await this.downloadBlob(change.blobHash);
              if (blobResult.content) {
                const encoder = new TextEncoder();
                const content = encoder.encode(blobResult.content).buffer;

                this.config.versionManager.createVersion(
                  change.filePath,
                  change.newRevision ?? commit.commitSeq.toString(),
                  change.blobHash,
                  blobResult.content,
                  '' // message
                );

                // Write to vault if vaultPath is set
                if (this.config.vaultPath) {
                  const fullPath = `${this.config.vaultPath}/${change.filePath}`;
                  const fs = await import('fs/promises');
                  const { dirname } = await import('path');
                  await fs.mkdir(dirname(fullPath), { recursive: true });
                  await fs.writeFile(fullPath, blobResult.content, 'utf-8');
                }

                downloaded.push(change.filePath);
              }
            }
          } catch (error) {
            errors.push(`Failed to process change for ${change.filePath}: ${error}`);
          }
        }
      }

      // Update blob refs cache
      // (In a full implementation, we'd store these for later use)
    } catch (error) {
      errors.push(`Pull failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { downloaded, conflicts, errors };
  }

  private async downloadBlob(blobHash: string): Promise<{ content: string | null }> {
    try {
      const response = await this.config.serverAdapter.createBlobDownloadUrl({
        vaultId: this.config.vaultId,
        blobHash,
      });

      // Download from presigned URL
      const blobResponse = await fetch(response.downloadUrl);
      if (!blobResponse.ok) {
        throw new Error(`Failed to download blob: HTTP ${blobResponse.status}`);
      }

      const content = await blobResponse.text();
      return { content };
    } catch (error) {
      console.error(`[ClientSyncEngine] Failed to download blob ${blobHash}:`, error);
      return { content: null };
    }
  }

  // =============================================================================
  // Step 5: Acknowledge Changes
  // =============================================================================

  private async acknowledgeChanges(): Promise<void> {
    try {
      // Get last processed sequence number
      const lastSeq = 0; // TODO: Track and persist last processed sequence

      await this.config.serverAdapter.ack({
        vaultId: this.config.vaultId,
        deviceId: this.config.deviceId,
        ackedSeq: lastSeq,
      });

      // Mark all pending changes as synced
      const entries = this.config.changeLogger.getUnsyncedEntries();
      const ids = entries.map((e) => e.id!).filter(Boolean);
      if (ids.length > 0) {
        this.config.changeLogger.markSynced(ids);
      }
    } catch (error) {
      console.error('[ClientSyncEngine] Ack failed:', error);
      // Don't throw - ack failure shouldn't fail the whole sync
    }
  }

  // =============================================================================
  // Pending Queue Management
  // =============================================================================

  /**
   * Add a local change to the pending queue
   */
  queueChange(change: SyncChangeInput): void {
    this.pendingQueue.push(change);

    // If idle and enabled, trigger sync
    if (this.status === 'IDLE') {
      this.sync('pending_change').catch((err) => {
        console.error('[ClientSyncEngine] Queued change sync failed:', err);
      });
    }
  }

  /**
   * Clear pending queue (e.g., on logout)
   */
  clearPendingQueue(): SyncChangeInput[] {
    const cleared = [...this.pendingQueue];
    this.pendingQueue = [];
    return cleared;
  }

  /**
   * Restore pending queue (e.g., on re-login)
   */
  restorePendingQueue(changes: SyncChangeInput[]): void {
    this.pendingQueue.push(...changes);
  }
}
