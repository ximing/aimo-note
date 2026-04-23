/**
 * Sync IPC wrapper
 *
 * Handles sync-related IPC calls between renderer and main process.
 * This is a placeholder implementation - full sync integration
 * will be completed in a follow-up task.
 */

import type { SyncStatus, SnapshotRecord, SnapshotRestoreResult as SnapshotRestoreResultDTO } from '@aimo-note/dto';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingCount: number;
  isEnabled: boolean;
  vaultId: string | null;
  vaultName: string | null;
}

export interface VaultInfo {
  id: string;
  name: string;
  description?: string;
}

export interface ConflictInfo {
  id: string;
  filePath: string;
  expectedBaseRevision: string;
  actualHeadRevision: string;
  remoteBlobHash: string;
  winningCommitSeq: number;
  losingDeviceId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  conflictCopyPath: string | null;
}

export interface HistoryEntry {
  revision: string;
  blobHash: string | null;
  commitSeq: number;
  createdAt: string;
  deviceId: string;
  isDeleted: boolean;
}

// Snapshot types - re-exported from dto for compatibility
export type SnapshotInfo = SnapshotRecord;
export type SnapshotRestoreInfo = SnapshotRestoreResultDTO;

// Placeholder sync interface - will be connected to actual electron API
interface SyncAPI {
  getStatus: () => Promise<{
    success: boolean;
    status?: string;
    lastSyncAt?: string | null;
    error?: string | null;
    pendingCount?: number;
    isEnabled?: boolean;
    vaultId?: string | null;
    vaultName?: string | null;
  }>;
  trigger: (trigger?: string) => Promise<{ success: boolean; error?: string }>;
  getConflicts: (vaultId?: string) => Promise<{
    success: boolean;
    conflicts: ConflictInfo[];
    error?: string;
  }>;
  resolveConflict: (conflictId: string, resolutionPath: string) => Promise<{ success: boolean; error?: string }>;
  rollback: (vaultPath: string, filePath: string, targetVersion: string) => Promise<{ success: boolean; error?: string }>;
  listHistory: (vaultId: string, filePath: string, page?: number, pageSize?: number) => Promise<{
    success: boolean;
    items: HistoryEntry[];
    page: number;
    pageSize: number;
    hasMore: boolean;
    error?: string;
  }>;
  openConflictCopy: (conflictId: string, filePath: string) => Promise<{ success: boolean; error?: string }>;
  recordConflictCopyPath: (conflictId: string, conflictCopyPath: string) => Promise<{ success: boolean }>;
  configure: (serverUrl: string, deviceId: string) => Promise<{ success: boolean; error?: string }>;
  listVaults: () => Promise<{
    success: boolean;
    vaults?: VaultInfo[];
    error?: string;
  }>;
  createVault: (name: string, description?: string) => Promise<{
    success: boolean;
    vault?: VaultInfo;
    error?: string;
  }>;
  bindVault: (vaultId: string) => Promise<{ success: boolean; error?: string }>;
  unbindVault: () => Promise<{ success: boolean; error?: string }>;
  registerDevice: (vaultId: string, deviceName: string) => Promise<{
    success: boolean;
    deviceId?: string;
    error?: string;
  }>;
  getDiagnostics: (vaultId?: string) => Promise<{
    success: boolean;
    diagnostics: {
      lastTriggerSource: string | null;
      offlineReason: string | null;
      nextRetryAt: string | null;
      lastFailedRequestId: string | null;
      lastFailedRequestDeviceId: string | null;
      lastSuccessfulSyncAt: string | null;
      consecutiveFailures: number;
    } | null;
    error?: string;
  }>;
  recordRuntimeEvent: (eventData: {
    vaultId: string;
    deviceId: string;
    trigger: string;
    retryCount: number;
    offlineStartedAt?: string | null;
    recoveredAt?: string | null;
    nextRetryAt?: string | null;
    requestId: string;
  }) => Promise<{
    success: boolean;
    accepted: boolean;
    deduplicated: boolean;
    error?: string;
  }>;
  listSnapshots: (vaultId: string, page?: number, pageSize?: number) => Promise<{
    success: boolean;
    items: SnapshotInfo[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
    error?: string;
  }>;
  createSnapshot: (vaultId: string, description?: string) => Promise<{
    success: boolean;
    snapshot?: SnapshotInfo;
    error?: string;
  }>;
  getSnapshot: (snapshotId: string) => Promise<{
    success: boolean;
    snapshot?: SnapshotInfo;
    error?: string;
  }>;
  restoreSnapshot: (snapshotId: string, vaultId: string, deviceId?: string) => Promise<{
    success: boolean;
    result?: SnapshotRestoreInfo;
    existingTask?: SnapshotRestoreInfo;
    error?: string;
  }>;
}

// Get sync API if available, otherwise return null
function getSyncAPI(): SyncAPI | null {
  const api = window.electronAPI as { sync?: SyncAPI } | undefined;
  return api?.sync ?? null;
}

export const sync = {
  /**
   * Get sync status
   */
  async getStatus(): Promise<{
    success: boolean;
    status?: SyncStatus;
    lastSyncAt?: string | null;
    error?: string | null;
    pendingCount?: number;
    isEnabled?: boolean;
    vaultId?: string | null;
    vaultName?: string | null;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return {
        success: true,
        status: 'DISABLED' as SyncStatus,
        lastSyncAt: null,
        error: null,
        pendingCount: 0,
        isEnabled: false,
        vaultId: null,
        vaultName: null,
      };
    }
    const result = await api.getStatus();
    return {
      ...result,
      status: result.status as SyncStatus | undefined,
    };
  },

  /**
   * Trigger a sync
   */
  async trigger(trigger?: string): Promise<{ success: boolean; error?: string }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.trigger(trigger);
  },

  /**
   * Get sync conflicts
   */
  async getConflicts(vaultId?: string): Promise<{
    success: boolean;
    conflicts: ConflictInfo[];
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: true, conflicts: [] };
    }
    return api.getConflicts(vaultId);
  },

  /**
   * Resolve a conflict
   */
  async resolveConflict(
    conflictId: string,
    resolutionPath: string
  ): Promise<{ success: boolean; error?: string }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.resolveConflict(conflictId, resolutionPath);
  },

  /**
   * Rollback a file to a specific version
   */
  async rollback(
    vaultPath: string,
    filePath: string,
    targetVersion: string
  ): Promise<{ success: boolean; error?: string }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.rollback(vaultPath, filePath, targetVersion);
  },

  /**
   * List file revision history
   */
  async listHistory(
    vaultId: string,
    filePath: string,
    page?: number,
    pageSize?: number
  ): Promise<{
    success: boolean;
    items: HistoryEntry[];
    page: number;
    pageSize: number;
    hasMore: boolean;
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured', items: [], page: 1, pageSize: 50, hasMore: false };
    }
    return api.listHistory(vaultId, filePath, page, pageSize);
  },

  /**
   * Open a conflict copy file
   */
  async openConflictCopy(conflictId: string, filePath: string): Promise<{ success: boolean; error?: string }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.openConflictCopy(conflictId, filePath);
  },

  /**
   * Configure sync with server URL and device ID
   */
  async configure(serverUrl: string, deviceId: string): Promise<{ success: boolean; error?: string }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.configure(serverUrl, deviceId);
  },

  /**
   * List user's vaults from server
   */
  async listVaults(): Promise<{
    success: boolean;
    vaults?: VaultInfo[];
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: true, vaults: [] };
    }
    return api.listVaults();
  },

  /**
   * Create a new vault
   */
  async createVault(
    name: string,
    description?: string
  ): Promise<{
    success: boolean;
    vault?: VaultInfo;
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Server not configured' };
    }
    return api.createVault(name, description);
  },

  /**
   * Bind current local vault to a remote vault
   */
  async bindVault(vaultId: string): Promise<{ success: boolean; error?: string }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.bindVault(vaultId);
  },

  /**
   * Unbind vault (disable sync for current vault)
   */
  async unbindVault(): Promise<{ success: boolean; error?: string }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: true };
    }
    return api.unbindVault();
  },

  /**
   * Register a device for a vault
   */
  async registerDevice(
    vaultId: string,
    deviceName: string
  ): Promise<{
    success: boolean;
    deviceId?: string;
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Server not configured' };
    }
    return api.registerDevice(vaultId, deviceName);
  },

  /**
   * Get sync diagnostics from server
   */
  async getDiagnostics(vaultId?: string): Promise<{
    success: boolean;
    diagnostics: {
      lastTriggerSource: string | null;
      offlineReason: string | null;
      nextRetryAt: string | null;
      lastFailedRequestId: string | null;
      lastFailedRequestDeviceId: string | null;
      lastSuccessfulSyncAt: string | null;
      consecutiveFailures: number;
    } | null;
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: true, diagnostics: null };
    }
    return api.getDiagnostics(vaultId);
  },

  /**
   * Record a sync runtime event
   */
  async recordRuntimeEvent(eventData: {
    vaultId: string;
    deviceId: string;
    trigger: string;
    retryCount: number;
    offlineStartedAt?: string | null;
    recoveredAt?: string | null;
    nextRetryAt?: string | null;
    requestId: string;
  }): Promise<{
    success: boolean;
    accepted: boolean;
    deduplicated: boolean;
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured', accepted: false, deduplicated: false };
    }
    return api.recordRuntimeEvent(eventData);
  },

  // =============================================================================
  // Snapshot Operations
  // =============================================================================

  /**
   * List snapshots for a vault
   */
  async listSnapshots(vaultId: string, page?: number, pageSize?: number): Promise<{
    success: boolean;
    items: SnapshotInfo[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: true, items: [], page: 1, pageSize: 20, total: 0, hasMore: false };
    }
    return api.listSnapshots(vaultId, page, pageSize);
  },

  /**
   * Create a new snapshot
   */
  async createSnapshot(vaultId: string, description?: string): Promise<{
    success: boolean;
    snapshot?: SnapshotInfo;
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.createSnapshot(vaultId, description);
  },

  /**
   * Get snapshot status by ID
   */
  async getSnapshot(snapshotId: string): Promise<{
    success: boolean;
    snapshot?: SnapshotInfo;
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.getSnapshot(snapshotId);
  },

  /**
   * Restore a snapshot
   */
  async restoreSnapshot(snapshotId: string, vaultId: string, deviceId?: string): Promise<{
    success: boolean;
    result?: SnapshotRestoreInfo;
    existingTask?: SnapshotRestoreInfo;
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.restoreSnapshot(snapshotId, vaultId, deviceId);
  },
};