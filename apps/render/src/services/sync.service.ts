/**
 * SyncService - Renderer-side sync orchestration
 *
 * Manages sync state and coordinates between the UI and the sync engine.
 * This service runs in the renderer process and communicates with
 * the sync engine via IPC.
 */

import { Service, resolve } from '@rabjs/react';
import type { SyncStatus } from '@aimo-note/dto';
import { auth } from '@/ipc/auth';
import { sync } from '@/ipc/sync';
import { VaultService } from './vault.service';
import { UIService } from './ui.service';

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

export class SyncService extends Service {
  // State
  status: SyncStatus = 'DISABLED';
  lastSyncAt: string | null = null;
  lastError: string | null = null;
  pendingCount = 0;
  isEnabled = false;
  vaultId: string | null = null;
  vaultName: string | null = null;
  serverUrl = '';
  deviceId = '';

  // User info
  userId: string | null = null;
  userEmail: string | null = null;

  // Vaults
  vaults: VaultInfo[] = [];

  // Loading states
  isLoggingIn = false;
  isLoadingVaults = false;
  isSyncing = false;

  get vaultService(): VaultService {
    return this.resolve(VaultService);
  }

  get uiService(): UIService {
    return this.resolve(UIService);
  }

  // =============================================================================
  // Auth
  // =============================================================================

  /**
   * Check if user is logged in
   */
  async checkAuth(): Promise<boolean> {
    try {
      const result = await auth.getToken();
      if (result.success && result.value) {
        // Verify token is still valid
        const meResult = await auth.me();
        if (meResult.success && meResult.user) {
          this.userId = meResult.user.id;
          this.userEmail = meResult.user.email;
          return true;
        }
      }
    } catch {
      // Not logged in
    }
    this.userId = null;
    this.userEmail = null;
    return false;
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    this.isLoggingIn = true;
    try {
      const result = await auth.login(email, password);
      if (result.success) {
        this.userId = result.user?.id ?? null;
        this.userEmail = result.user?.email ?? null;
        return { success: true };
      }
      return { success: false, error: result.error ?? 'Login failed' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.isLoggingIn = false;
    }
  }

  /**
   * Register a new user
   */
  async register(
    email: string,
    password: string,
    username: string
  ): Promise<{ success: boolean; error?: string }> {
    this.isLoggingIn = true;
    try {
      const result = await auth.register(email, password, username);
      if (result.success) {
        this.userId = result.user?.id ?? null;
        this.userEmail = result.user?.email ?? null;
        return { success: true };
      }
      return { success: false, error: result.error ?? 'Registration failed' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.isLoggingIn = false;
    }
  }

  /**
   * Logout and disable sync
   */
  async logout(): Promise<void> {
    try {
      await auth.logout();
    } catch {
      // Ignore logout errors
    }
    this.status = 'DISABLED';
    this.isEnabled = false;
    this.userId = null;
    this.userEmail = null;
    this.vaultId = null;
    this.vaultName = null;
    this.vaults = [];
  }

  // =============================================================================
  // Vault Management
  // =============================================================================

  /**
   * Load user's vaults from server
   */
  async loadVaults(): Promise<void> {
    this.isLoadingVaults = true;
    try {
      const result = await sync.listVaults();
      if (result.success) {
        this.vaults = result.vaults ?? [];
      }
    } catch (error) {
      console.error('[SyncService] Failed to load vaults:', error);
    } finally {
      this.isLoadingVaults = false;
    }
  }

  /**
   * Create a new vault
   */
  async createVault(
    name: string,
    description?: string
  ): Promise<{ success: boolean; vaultId?: string; error?: string }> {
    try {
      const result = await sync.createVault(name, description);
      if (result.success && result.vault) {
        await this.loadVaults();
        return { success: true, vaultId: result.vault.id };
      }
      return { success: false, error: result.error ?? 'Failed to create vault' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Bind current local vault to a remote vault
   */
  async bindVault(vaultId: string, vaultName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await sync.bindVault(vaultId);
      if (result.success) {
        this.vaultId = vaultId;
        this.vaultName = vaultName;
        this.isEnabled = true;
        this.status = 'IDLE';
        return { success: true };
      }
      return { success: false, error: result.error ?? 'Failed to bind vault' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Unbind vault (disable sync for current vault)
   */
  async unbindVault(): Promise<void> {
    try {
      await sync.unbindVault();
    } catch {
      // Ignore errors
    }
    this.isEnabled = false;
    this.status = 'DISABLED';
  }

  // =============================================================================
  // Sync Operations
  // =============================================================================

  /**
   * Trigger a manual sync
   */
  async syncNow(): Promise<{ success: boolean; error?: string }> {
    if (!this.isEnabled || !this.vaultId) {
      return { success: false, error: 'Sync not enabled' };
    }

    this.isSyncing = true;
    this.status = 'SYNCING';
    try {
      const result = await sync.trigger();
      if (result.success) {
        this.lastSyncAt = new Date().toISOString();
        this.lastError = null;
        this.status = 'IDLE';
        return { success: true };
      }
      this.lastError = result.error ?? 'Sync failed';
      this.status = 'ERROR';
      return { success: false, error: result.error ?? 'Sync failed' };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.status = 'ERROR';
      return { success: false, error: this.lastError };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Get sync status
   */
  async fetchStatus(): Promise<SyncState> {
    try {
      const result = await sync.getStatus();
      if (result.success) {
        this.status = (result.status as SyncStatus) ?? 'DISABLED';
        this.lastSyncAt = result.lastSyncAt ?? null;
        this.lastError = result.error ?? null;
        this.pendingCount = result.pendingCount ?? 0;
        this.isEnabled = result.isEnabled ?? false;
        this.vaultId = result.vaultId ?? null;
        this.vaultName = result.vaultName ?? null;
      }
    } catch (error) {
      console.error('[SyncService] Failed to fetch status:', error);
    }

    return this.getState();
  }

  /**
   * Get current state snapshot
   */
  getState(): SyncState {
    return {
      status: this.status,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      pendingCount: this.pendingCount,
      isEnabled: this.isEnabled,
      vaultId: this.vaultId,
      vaultName: this.vaultName,
    };
  }

  /**
   * Configure server URL and device ID
   */
  configure(serverUrl: string, deviceId: string): void {
    this.serverUrl = serverUrl;
    this.deviceId = deviceId;
  }
}

// Singleton export
export function useSyncService(): SyncService {
  return resolve(SyncService);
}
