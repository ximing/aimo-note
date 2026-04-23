/**
 * SyncState - Vault-scoped sync state management
 *
 * Persists sync_enabled, cursor (lastPulledSeq/lastSuccessfulCommitSeq),
 * and runtime state (trigger, offline, retry) per vaultId.
 *
 * Per State Scope Guardrail:
 * - device_id is device-global (not vault-scoped)
 * - sync_enabled, cursor, runtime state are vaultId-scoped
 */

import Database from 'better-sqlite3';
import type { SyncStatus, SyncTrigger } from '@aimo-note/dto';

interface SyncStateRow {
  key: string;
  value: string;
}

/**
 * Runtime state persisted per vault
 */
export interface SyncRuntimeState {
  trigger: SyncTrigger | null;
  offlineReason: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncError: string | null;
}

export class SyncStateStore {
  constructor(private db: InstanceType<typeof Database>) {}

  // =============================================================================
  // Status
  // =============================================================================

  getStatus(vaultId: string): SyncStatus {
    const row = this.getRow(this.statusKey(vaultId));
    return (row?.value as SyncStatus) ?? 'DISABLED';
  }

  setStatus(vaultId: string, status: SyncStatus): void {
    this.setRow(this.statusKey(vaultId), status);
  }

  // =============================================================================
  // Cursor
  // =============================================================================

  updateCursor(vaultId: string, lastPulledSeq: number, lastSuccessfulCommitSeq: number): void {
    this.setRow(this.lastPulledSeqKey(vaultId), lastPulledSeq.toString());
    this.setRow(this.lastSuccessfulCommitSeqKey(vaultId), lastSuccessfulCommitSeq.toString());
  }

  getLastPulledSeq(vaultId: string): number {
    const row = this.getRow(this.lastPulledSeqKey(vaultId));
    return row ? parseInt(row.value, 10) : 0;
  }

  getLastSuccessfulCommitSeq(vaultId: string): number {
    const row = this.getRow(this.lastSuccessfulCommitSeqKey(vaultId));
    return row ? parseInt(row.value, 10) : 0;
  }

  // =============================================================================
  // Sync Enabled
  // =============================================================================

  isSyncEnabled(vaultId: string): boolean {
    const row = this.getRow(this.syncEnabledKey(vaultId));
    return row?.value === 'true';
  }

  setSyncEnabled(vaultId: string, enabled: boolean): void {
    this.setRow(this.syncEnabledKey(vaultId), enabled ? 'true' : 'false');
    // When disabling, set status to DISABLED
    if (!enabled) {
      this.setStatus(vaultId, 'DISABLED');
    }
  }

  // =============================================================================
  // Runtime State
  // =============================================================================

  updateRuntimeState(vaultId: string, state: Partial<SyncRuntimeState>): void {
    if (state.trigger !== undefined && state.trigger !== null) {
      this.setRow(this.triggerKey(vaultId), state.trigger);
    }
    if (state.offlineReason !== undefined) {
      this.setRow(this.offlineReasonKey(vaultId), state.offlineReason ?? '');
    }
    if (state.retryCount !== undefined) {
      this.setRow(this.retryCountKey(vaultId), state.retryCount.toString());
    }
    if (state.nextRetryAt !== undefined) {
      this.setRow(this.nextRetryAtKey(vaultId), state.nextRetryAt ?? '');
    }
    if (state.lastSyncStartedAt !== undefined) {
      this.setRow(this.lastSyncStartedAtKey(vaultId), state.lastSyncStartedAt ?? '');
    }
    if (state.lastSyncCompletedAt !== undefined) {
      this.setRow(this.lastSyncCompletedAtKey(vaultId), state.lastSyncCompletedAt ?? '');
    }
    if (state.lastSyncError !== undefined) {
      this.setRow(this.lastSyncErrorKey(vaultId), state.lastSyncError ?? '');
    }
  }

  getRuntimeState(vaultId: string): SyncRuntimeState {
    return {
      trigger: (this.getRow(this.triggerKey(vaultId))?.value as SyncTrigger) ?? null,
      offlineReason: this.getRow(this.offlineReasonKey(vaultId))?.value ?? null,
      retryCount: parseInt(this.getRow(this.retryCountKey(vaultId))?.value ?? '0', 10),
      nextRetryAt: this.getRow(this.nextRetryAtKey(vaultId))?.value ?? null,
      lastSyncStartedAt: this.getRow(this.lastSyncStartedAtKey(vaultId))?.value ?? null,
      lastSyncCompletedAt: this.getRow(this.lastSyncCompletedAtKey(vaultId))?.value ?? null,
      lastSyncError: this.getRow(this.lastSyncErrorKey(vaultId))?.value ?? null,
    };
  }

  // =============================================================================
  // Device ID (device-global, not vault-scoped)
  // =============================================================================

  getDeviceId(): string | null {
    const row = this.getRow('device_id');
    return row?.value ?? null;
  }

  setDeviceId(deviceId: string): void {
    this.setRow('device_id', deviceId);
  }

  // =============================================================================
  // Private helpers
  // =============================================================================

  private statusKey(vaultId: string): string {
    return `sync_status:${vaultId}`;
  }

  private syncEnabledKey(vaultId: string): string {
    return `sync_enabled:${vaultId}`;
  }

  private lastPulledSeqKey(vaultId: string): string {
    return `last_pulled_seq:${vaultId}`;
  }

  private lastSuccessfulCommitSeqKey(vaultId: string): string {
    return `last_successful_commit_seq:${vaultId}`;
  }

  private triggerKey(vaultId: string): string {
    return `last_sync_trigger:${vaultId}`;
  }

  private offlineReasonKey(vaultId: string): string {
    return `offline_reason:${vaultId}`;
  }

  private retryCountKey(vaultId: string): string {
    return `retry_count:${vaultId}`;
  }

  private nextRetryAtKey(vaultId: string): string {
    return `next_retry_at:${vaultId}`;
  }

  private lastSyncStartedAtKey(vaultId: string): string {
    return `last_sync_started_at:${vaultId}`;
  }

  private lastSyncCompletedAtKey(vaultId: string): string {
    return `last_sync_completed_at:${vaultId}`;
  }

  private lastSyncErrorKey(vaultId: string): string {
    return `last_sync_error:${vaultId}`;
  }

  private getRow(key: string): SyncStateRow | undefined {
    return this.db
      .prepare('SELECT * FROM sync_state WHERE key = ?')
      .get(key) as SyncStateRow | undefined;
  }

  private setRow(key: string, value: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)')
      .run(key, value);
  }
}