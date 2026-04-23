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
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

export interface ClientSyncEngineConfig {
  serverAdapter: ServerAdapter;
  blobUploader: BlobUploader;
  versionManager: VersionManager;
  changeLogger: ChangeLogger;
  conflictManager?: ConflictManager;
  deviceId: string;
  vaultId: string;
  vaultPath?: string;
  // Sync state store for cursor management
  syncStateStore?: {
    getLastPulledSeq(vaultId: string): number;
    updateCursor(vaultId: string, lastPulledSeq: number, lastSuccessfulCommitSeq: number): void;
  };
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
  // Track conflict IDs resolved locally that need to be propagated to server
  private pendingResolutions: Set<number> = new Set();

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
    this.startPeriodicSync();
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
      this.sync('periodic').catch((err) => {
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
      this.sync('network_recovered').catch((err) => {
        console.error('[ClientSyncEngine] Network recovery sync failed:', err);
        // Set OFFLINE (not ERROR) when network recovery fails - the network may be
        // intermittently unavailable and we should retry rather than treating it as
        // a permanent error state
        this.setStatus('OFFLINE', 'network recovery failed');
      });
    } else if (!online) {
      this.stopPeriodicSync();
      this.setStatus('OFFLINE', 'network lost');
    }
  }

  // =============================================================================
  // Sync Trigger
  // =============================================================================

  /**
   * Determine if an error is a network error (should result in OFFLINE status)
   */
  private isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      // Node.js network errors have a 'code' property
      const nodeError = error as Error & { code?: string };
      if (nodeError.code === 'ECONNREFUSED' || nodeError.code === 'ETIMEDOUT' || nodeError.code === 'ENOTFOUND') {
        return true;
      }
      // Message indicates network failure
      const msg = error.message.toLowerCase();
      if (msg.includes('fetch') && (msg.includes('network') || msg.includes('failed') || msg.includes('connection'))) {
        return true;
      }
      if (msg.includes('econnrefused') || msg.includes('etimedout') || msg.includes('enotfound')) {
        return true;
      }
    }
    return false;
  }

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

      // Step 6: Propagate any locally-resolved conflicts to the server
      const propagateResult = await this.propagateConflictResolutions();
      result.errors.push(...propagateResult.errors);

      // Success
      this.lastSyncAt = new Date().toISOString();
      this.lastError = null;
      this.setStatus('IDLE', 'sync completed');

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastError = errorMessage;
      result.errors.push(errorMessage);
      // Network errors (ECONNREFUSED, ETIMEDOUT, fetch network failures) should set OFFLINE
      // regardless of trigger - only 401/403/data errors = ERROR
      const isNetworkError = this.isNetworkError(error);
      const status = isNetworkError ? 'OFFLINE' : 'ERROR';
      this.setStatus(status, errorMessage);
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
            // Record the conflict using canonical ServerConflict fields
            const record = this.config.conflictManager.record({
              filePath: conflict.filePath,
              expectedBaseRevision: conflict.expectedBaseRevision,
              actualHeadRevision: conflict.actualHeadRevision,
              remoteBlobHash: conflict.remoteBlobHash,
              winningCommitSeq: conflict.winningCommitSeq,
              localHash: '',
            });
            console.log(`[ClientSyncEngine] Recorded conflict for ${conflict.filePath}:`, record);

            // Create conflict copy file in same directory as original file
            // remoteBlobHash may be null if server did not provide blob reference
            const conflictCopyPath = conflict.remoteBlobHash
              ? await this.createConflictCopy(conflict.filePath, conflict.remoteBlobHash)
              : null;
            if (conflictCopyPath && record.id) {
              this.config.conflictManager.updateConflictCopyPath(record.id, conflictCopyPath);
            }
          }
        }
      }
    } catch (error) {
      errors.push(`Commit failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { errors };
  }

  /**
   * Download remote blob and write conflict copy file to the same subdirectory as original file.
   * Returns the conflict copy path on success, null on failure.
   */
  private async createConflictCopy(filePath: string, blobHash: string): Promise<string | null> {
    if (!this.config.conflictManager || !this.config.vaultPath || !blobHash) {
      return null;
    }

    try {
      // Get download URL for the blob
      const downloadUrlResponse = await this.config.serverAdapter.createBlobDownloadUrl({
        vaultId: this.config.vaultId,
        blobHash,
      });

      // Download the blob content
      const blobResponse = await fetch(downloadUrlResponse.downloadUrl);
      if (!blobResponse.ok) {
        console.error(`[ClientSyncEngine] Failed to download blob for conflict copy: HTTP ${blobResponse.status}`);
        return null;
      }

      const content = await blobResponse.text();

      // Generate conflict filename (preserves subdirectory structure)
      const conflictFilename = this.config.conflictManager.generateConflictFilename(filePath);
      const conflictPath = join(this.config.vaultPath, conflictFilename);

      // Write conflict file to same subdirectory as original
      const dir = dirname(conflictPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(conflictPath, content, 'utf-8');

      console.log(`[ClientSyncEngine] Created conflict copy: ${conflictFilename}`);
      return conflictPath;
    } catch (error) {
      console.error(`[ClientSyncEngine] Failed to create conflict copy for ${filePath}:`, error);
      return null;
    }
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
      // Get last pulled sequence from persistent store
      const sinceSeq = this.config.syncStateStore?.getLastPulledSeq(this.config.vaultId) ?? 0;

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
      let blobResponse = await fetch(response.downloadUrl);

      // On 401/403, the URL may have expired - get a fresh URL and retry once
      if (blobResponse.status === 401 || blobResponse.status === 403) {
        console.log(`[ClientSyncEngine] Blob download URL expired (${blobResponse.status}), refreshing...`);
        const freshResponse = await this.config.serverAdapter.createBlobDownloadUrl({
          vaultId: this.config.vaultId,
          blobHash,
        });
        blobResponse = await fetch(freshResponse.downloadUrl);
      }

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
      // Get last pulled sequence from persistent store
      const lastSeq = this.config.syncStateStore?.getLastPulledSeq(this.config.vaultId) ?? 0;

      const response = await this.config.serverAdapter.ack({
        vaultId: this.config.vaultId,
        deviceId: this.config.deviceId,
        ackedSeq: lastSeq,
      });

      // Update persisted cursor after successful ack
      this.config.syncStateStore?.updateCursor(this.config.vaultId, response.lastPulledSeq, lastSeq);

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

  // =============================================================================
  // Conflict Resolution Tracking
  // =============================================================================

  /**
   * Queue a conflict resolution to be propagated to the server during the next sync.
   * Called when a conflict is resolved locally via ConflictManager.
   */
  queueConflictResolution(conflictId: number): void {
    this.pendingResolutions.add(conflictId);
    console.log(`[ClientSyncEngine] Queued conflict resolution for propagation: ${conflictId}`);
  }

  /**
   * Get pending conflict resolutions that need to be propagated to server.
   */
  getPendingResolutions(): number[] {
    return Array.from(this.pendingResolutions);
  }

  /**
   * Propagate pending conflict resolutions to the server.
   * Called during the sync cycle to ensure server has the resolution state.
   */
  private async propagateConflictResolutions(): Promise<{ errors: string[] }> {
    const errors: string[] = [];
    const resolutionIds = Array.from(this.pendingResolutions);

    if (resolutionIds.length === 0) {
      return { errors };
    }

    for (const conflictId of resolutionIds) {
      try {
        await this.config.serverAdapter.resolveConflict(this.config.vaultId, conflictId);
        // Remove from pending after successful propagation
        this.pendingResolutions.delete(conflictId);
        console.log(`[ClientSyncEngine] Propagated conflict resolution: ${conflictId}`);
      } catch (error) {
        errors.push(`Failed to propagate conflict resolution ${conflictId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { errors };
  }
}
