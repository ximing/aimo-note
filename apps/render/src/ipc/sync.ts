/**
 * Sync IPC wrapper
 *
 * Handles sync-related IPC calls between renderer and main process.
 * This is a placeholder implementation - full sync integration
 * will be completed in a follow-up task.
 */

import type { SyncStatus } from '@aimo-note/dto';

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
  trigger: () => Promise<{ success: boolean; error?: string }>;
  getConflicts: () => Promise<{
    success: boolean;
    conflicts: Array<{
      id: number;
      filePath: string;
      localVersion: string;
      remoteVersion: string;
      localHash: string;
      remoteHash: string;
      createdAt: string;
      resolved: boolean;
      resolutionPath: string | null;
    }>;
    error?: string;
  }>;
  resolveConflict: (id: number, resolutionPath: string) => Promise<{ success: boolean; error?: string }>;
  rollback: (filePath: string, targetVersion: string) => Promise<{ success: boolean; error?: string }>;
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
  async trigger(): Promise<{ success: boolean; error?: string }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.trigger();
  },

  /**
   * Get sync conflicts
   */
  async getConflicts(): Promise<{
    success: boolean;
    conflicts: Array<{
      id: number;
      filePath: string;
      localVersion: string;
      remoteVersion: string;
      localHash: string;
      remoteHash: string;
      createdAt: string;
      resolved: boolean;
      resolutionPath: string | null;
    }>;
    error?: string;
  }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: true, conflicts: [] };
    }
    return api.getConflicts();
  },

  /**
   * Resolve a conflict
   */
  async resolveConflict(
    id: number,
    resolutionPath: string
  ): Promise<{ success: boolean; error?: string }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.resolveConflict(id, resolutionPath);
  },

  /**
   * Rollback a file to a specific version
   */
  async rollback(
    filePath: string,
    targetVersion: string
  ): Promise<{ success: boolean; error?: string }> {
    const api = getSyncAPI();
    if (!api) {
      return { success: false, error: 'Sync not configured' };
    }
    return api.rollback(filePath, targetVersion);
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
};
