import { Service } from 'typedi';
import { logger } from '../utils/logger.js';

/**
 * Trigger sources for sync operations
 */
export const TriggerSource = {
  AUTO_SYNC: 'auto_sync',
  MANUAL_SYNC: 'manual_sync',
  OFFLINE_RECOVERY_RETRY: 'offline_recovery_retry',
} as const;

export type TriggerSourceType = (typeof TriggerSource)[keyof typeof TriggerSource];

/**
 * Sync metric counters
 */
export interface SyncMetrics {
  commitSuccessTotal: number;
  commitConflictTotal: number;
  commitFailTotal: number;
  pullSuccessTotal: number;
  blobUploadRequestTotal: number;
  blobExistingHitTotal: number;
  ackTotal: number;
  snapshotCreateTotal: number;
  snapshotRestoreTotal: number;
  capturedAt: Date;
}

/**
 * Sync runtime state
 */
export interface SyncRuntimeState {
  offlineDurationMs: number;
  retryCount: number;
  lastRecoverySuccessTime: Date | null;
  triggerSource: TriggerSourceType | null;
}

/**
 * Aggregated sync request log entry
 */
export interface SyncRequestLog {
  requestId: string;
  userId: string;
  vaultId: string;
  deviceId: string;
  triggerSource: TriggerSourceType;
  operation: string;
  success: boolean;
  durationMs: number;
  timestamp: Date;
  errorMessage?: string;
}

/**
 * MetricsService tracks sync metrics and aggregates sync request logs
 * with client runtime events.
 */
@Service()
export class MetricsService {
  // Counters
  private commitSuccessTotal = 0;
  private commitConflictTotal = 0;
  private commitFailTotal = 0;
  private pullSuccessTotal = 0;
  private blobUploadRequestTotal = 0;
  private blobExistingHitTotal = 0;
  private ackTotal = 0;
  private snapshotCreateTotal = 0;
  private snapshotRestoreTotal = 0;

  // Runtime state
  private offlineDurationMs = 0;
  private retryCount = 0;
  private lastRecoverySuccessTime: Date | null = null;
  private currentTriggerSource: TriggerSourceType | null = null;

  // Request logs buffer
  private requestLogs: SyncRequestLog[] = [];
  private readonly maxLogEntries = 1000;

  /**
   * Record a successful commit
   */
  recordCommitSuccess(triggerSource: TriggerSourceType = TriggerSource.AUTO_SYNC): void {
    this.commitSuccessTotal++;
    this.currentTriggerSource = triggerSource;
    logger.debug('Metric: commit_success_total incremented', { triggerSource });
  }

  /**
   * Record a commit that resulted in conflict
   */
  recordCommitConflict(triggerSource: TriggerSourceType = TriggerSource.AUTO_SYNC): void {
    this.commitConflictTotal++;
    this.currentTriggerSource = triggerSource;
    logger.debug('Metric: commit_conflict_total incremented', { triggerSource });
  }

  /**
   * Record a failed commit
   */
  recordCommitFail(
    triggerSource: TriggerSourceType = TriggerSource.AUTO_SYNC,
    errorMessage?: string
  ): void {
    this.commitFailTotal++;
    this.currentTriggerSource = triggerSource;
    logger.debug('Metric: commit_fail_total incremented', { triggerSource, errorMessage });
  }

  /**
   * Record a successful pull
   */
  recordPullSuccess(triggerSource: TriggerSourceType = TriggerSource.AUTO_SYNC): void {
    this.pullSuccessTotal++;
    this.currentTriggerSource = triggerSource;
    logger.debug('Metric: pull_success_total incremented', { triggerSource });
  }

  /**
   * Record a blob upload request
   */
  recordBlobUploadRequest(triggerSource: TriggerSourceType = TriggerSource.AUTO_SYNC): void {
    this.blobUploadRequestTotal++;
    this.currentTriggerSource = triggerSource;
    logger.debug('Metric: blob_upload_request_total incremented', { triggerSource });
  }

  /**
   * Record a blob existing hit (blob already on server)
   */
  recordBlobExistingHit(triggerSource: TriggerSourceType = TriggerSource.AUTO_SYNC): void {
    this.blobExistingHitTotal++;
    this.currentTriggerSource = triggerSource;
    logger.debug('Metric: blob_existing_hit_total incremented', { triggerSource });
  }

  /**
   * Record an ack operation
   */
  recordAck(triggerSource: TriggerSourceType = TriggerSource.AUTO_SYNC): void {
    this.ackTotal++;
    this.currentTriggerSource = triggerSource;
    logger.debug('Metric: ack_total incremented', { triggerSource });
  }

  /**
   * Record a snapshot creation
   */
  recordSnapshotCreate(triggerSource: TriggerSourceType = TriggerSource.MANUAL_SYNC): void {
    this.snapshotCreateTotal++;
    this.currentTriggerSource = triggerSource;
    logger.debug('Metric: snapshot_create_total incremented', { triggerSource });
  }

  /**
   * Record a snapshot restore
   */
  recordSnapshotRestore(triggerSource: TriggerSourceType = TriggerSource.MANUAL_SYNC): void {
    this.snapshotRestoreTotal++;
    this.currentTriggerSource = triggerSource;
    logger.debug('Metric: snapshot_restore_total incremented', { triggerSource });
  }

  /**
   * Record offline duration
   */
  recordOfflineDuration(durationMs: number): void {
    this.offlineDurationMs = durationMs;
    logger.debug('Metric: offline_duration updated', { durationMs });
  }

  /**
   * Record retry count
   */
  recordRetry(count: number): void {
    this.retryCount = count;
    logger.debug('Metric: retry_count updated', { count });
  }

  /**
   * Record successful recovery
   */
  recordRecoverySuccess(): void {
    this.lastRecoverySuccessTime = new Date();
    this.retryCount = 0;
    logger.debug('Metric: recovery_success recorded', {
      lastRecoverySuccessTime: this.lastRecoverySuccessTime,
    });
  }

  /**
   * Log a sync request with client runtime events aggregated
   */
  logSyncRequest(params: {
    requestId: string;
    userId: string;
    vaultId: string;
    deviceId: string;
    operation: string;
    success: boolean;
    durationMs: number;
    errorMessage?: string;
    triggerSource?: TriggerSourceType;
  }): void {
    const entry: SyncRequestLog = {
      ...params,
      triggerSource: params.triggerSource ?? this.currentTriggerSource ?? TriggerSource.AUTO_SYNC,
      timestamp: new Date(),
    };

    this.requestLogs.push(entry);

    // Trim buffer if needed
    if (this.requestLogs.length > this.maxLogEntries) {
      this.requestLogs = this.requestLogs.slice(-this.maxLogEntries);
    }

    logger.debug('Sync request logged', {
      requestId: params.requestId,
      operation: params.operation,
      success: params.success,
      triggerSource: entry.triggerSource,
    });
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): SyncMetrics {
    return {
      commitSuccessTotal: this.commitSuccessTotal,
      commitConflictTotal: this.commitConflictTotal,
      commitFailTotal: this.commitFailTotal,
      pullSuccessTotal: this.pullSuccessTotal,
      blobUploadRequestTotal: this.blobUploadRequestTotal,
      blobExistingHitTotal: this.blobExistingHitTotal,
      ackTotal: this.ackTotal,
      snapshotCreateTotal: this.snapshotCreateTotal,
      snapshotRestoreTotal: this.snapshotRestoreTotal,
      capturedAt: new Date(),
    };
  }

  /**
   * Get current runtime state
   */
  getRuntimeState(): SyncRuntimeState {
    return {
      offlineDurationMs: this.offlineDurationMs,
      retryCount: this.retryCount,
      lastRecoverySuccessTime: this.lastRecoverySuccessTime,
      triggerSource: this.currentTriggerSource,
    };
  }

  /**
   * Get recent request logs
   */
  getRequestLogs(limit = 100): SyncRequestLog[] {
    return this.requestLogs.slice(-limit);
  }

  /**
   * Reset all counters (for testing)
   */
  resetCounters(): void {
    this.commitSuccessTotal = 0;
    this.commitConflictTotal = 0;
    this.commitFailTotal = 0;
    this.pullSuccessTotal = 0;
    this.blobUploadRequestTotal = 0;
    this.blobExistingHitTotal = 0;
    this.ackTotal = 0;
    this.snapshotCreateTotal = 0;
    this.snapshotRestoreTotal = 0;
    this.offlineDurationMs = 0;
    this.retryCount = 0;
    this.lastRecoverySuccessTime = null;
    logger.debug('Metrics counters reset');
  }
}
