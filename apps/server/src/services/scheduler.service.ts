import { Service } from 'typedi';
import { getDb } from '../db/connection.js';
import { vaults } from '../db/schema/vaults.js';
import { snapshots } from '../db/schema/snapshots.js';
import { and, eq, lt } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { BlobService } from './blob.service.js';
import { SnapshotService } from './snapshot.service.js';
import type { TombstoneRetentionConfig } from '@aimo-note/dto';

/**
 * Task execution status
 */
export interface TaskExecution {
  taskId: string;
  taskName: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
  lastRunAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  nextScheduledAt: Date | null;
  executionCount: number;
}

/**
 * Cleanup task result
 */
export interface CleanupTaskResult {
  taskId: string;
  taskName: string;
  success: boolean;
  deletedCount?: number;
  error?: string;
  executedAt: Date;
}

/**
 * Scheduler service for background cleanup tasks.
 * Handles registration and execution of periodic cleanup tasks with:
 * - Idempotency guarantees
 * - Mutex/serialization for high-risk tasks
 * - Error observability and retry tracking
 */
@Service()
export class SchedulerService {
  // Task execution state
  private taskExecutions: Map<string, TaskExecution> = new Map();

  // Vault-level locks for serialization
  private vaultLocks: Map<string, Promise<void>> = new Map();

  // Default configurations
  private readonly defaultOrphanBlobRetentionDays = 30;
  private readonly defaultTombstoneRetentionConfig: TombstoneRetentionConfig = {
    retentionDays: 30,
    deviceCursorProtectedDays: 7,
    autoCleanup: true,
  };
  private readonly defaultSnapshotRetentionDays = 30;

  constructor(
    private readonly blobService: BlobService,
    private readonly snapshotService: SnapshotService
  ) {
    // Initialize task executions
    this.initializeTasks();
  }

  /**
   * Initialize task registry
   */
  private initializeTasks(): void {
    const tasks = [
      { taskId: 'orphan-blob-cleanup', taskName: 'Orphan Blob Cleanup' },
      { taskId: 'tombstone-retention-cleanup', taskName: 'Tombstone Retention Cleanup' },
      { taskId: 'snapshot-create', taskName: 'Snapshot Creation' },
      { taskId: 'snapshot-expire', taskName: 'Snapshot Expiration' },
    ];

    for (const task of tasks) {
      this.taskExecutions.set(task.taskId, {
        taskId: task.taskId,
        taskName: task.taskName,
        status: 'idle',
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        nextScheduledAt: null,
        executionCount: 0,
      });
    }

    logger.info('SchedulerService initialized', { taskCount: tasks.length });
  }

  /**
   * Run orphan blob cleanup for all vaults
   */
  async runOrphanBlobCleanup(vaultId?: string): Promise<CleanupTaskResult[]> {
    const taskId = 'orphan-blob-cleanup';
    const results: CleanupTaskResult[] = [];

    logger.info('SchedulerService.runOrphanBlobCleanup started', { vaultId });

    try {
      this.updateTaskStatus(taskId, 'running');

      // Get vaults to process
      const vaultsToProcess = await this.getVaultsToProcess(vaultId);

      for (const vault of vaultsToProcess) {
        // Acquire vault-level lock to prevent concurrent cleanup and restore
        const releaseLock = await this.acquireVaultLock(vault.id);

        try {
          // Check if another task is already running for this vault
          const existingTask = this.taskExecutions.get(taskId);
          if (existingTask?.status === 'running') {
            logger.warn('SchedulerService.runOrphanBlobCleanup skipping - task already running', {
              vaultId: vault.id,
            });
            continue;
          }

          const result = await this.blobService.cleanupOrphanBlobs(
            vault.id,
            this.defaultOrphanBlobRetentionDays
          );

          results.push({
            taskId,
            taskName: 'Orphan Blob Cleanup',
            success: result.errors.length === 0,
            deletedCount: result.deletedCount,
            error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
            executedAt: new Date(),
          });
        } finally {
          try { releaseLock(); } catch { /* log only */ }
        }
      }

      this.updateTaskStatus(taskId, 'completed');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.updateTaskError(taskId, errorMsg);
      results.push({
        taskId,
        taskName: 'Orphan Blob Cleanup',
        success: false,
        error: errorMsg,
        executedAt: new Date(),
      });
    }

    logger.info('SchedulerService.runOrphanBlobCleanup completed', {
      vaultCount: results.length,
      successCount: results.filter((r) => r.success).length,
    });

    return results;
  }

  /**
   * Run tombstone retention cleanup for all vaults
   */
  async runTombstoneRetentionCleanup(vaultId?: string): Promise<CleanupTaskResult[]> {
    const taskId = 'tombstone-retention-cleanup';
    const results: CleanupTaskResult[] = [];

    logger.info('SchedulerService.runTombstoneRetentionCleanup started', { vaultId });

    try {
      this.updateTaskStatus(taskId, 'running');

      // Get vaults to process
      const vaultsToProcess = await this.getVaultsToProcess(vaultId);

      for (const vault of vaultsToProcess) {
        // Acquire vault-level lock
        const releaseLock = await this.acquireVaultLock(vault.id);

        try {
          const result = await this.blobService.cleanupTombstones(
            vault.id,
            this.defaultTombstoneRetentionConfig
          );

          results.push({
            taskId,
            taskName: 'Tombstone Retention Cleanup',
            success: result.errors.length === 0,
            deletedCount: result.deletedCount,
            error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
            executedAt: new Date(),
          });
        } finally {
          try { releaseLock(); } catch { /* log only */ }
        }
      }

      this.updateTaskStatus(taskId, 'completed');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.updateTaskError(taskId, errorMsg);
      results.push({
        taskId,
        taskName: 'Tombstone Retention Cleanup',
        success: false,
        error: errorMsg,
        executedAt: new Date(),
      });
    }

    logger.info('SchedulerService.runTombstoneRetentionCleanup completed', {
      vaultCount: results.length,
      successCount: results.filter((r) => r.success).length,
    });

    return results;
  }

  /**
   * Run snapshot creation for all vaults (if configured)
   * This is a placeholder - actual snapshot creation requires user configuration
   */
  async runSnapshotCreate(vaultId?: string): Promise<CleanupTaskResult[]> {
    const taskId = 'snapshot-create';
    const results: CleanupTaskResult[] = [];

    logger.info('SchedulerService.runSnapshotCreate started', { vaultId });

    try {
      this.updateTaskStatus(taskId, 'running');

      // Get vaults to process
      const vaultsToProcess = await this.getVaultsToProcess(vaultId);

      for (const vault of vaultsToProcess) {
        const releaseLock = await this.acquireVaultLock(vault.id);

        try {
          // Snapshot creation is user-triggered, not automatic
          // This method can be called manually or via API
          // Use snapshotService to verify vault has no active snapshot operations
          const existingSnapshots = await this.snapshotService.listSnapshots(
            vault.ownerUserId,
            vault.id,
            { pageSize: 1 }
          );

          logger.debug('SchedulerService.runSnapshotCreate checking vault', {
            vaultId: vault.id,
            existingSnapshotCount: existingSnapshots.items.length,
          });
        } finally {
          try { releaseLock(); } catch { /* log only */ }
        }
      }

      this.updateTaskStatus(taskId, 'completed');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.updateTaskError(taskId, errorMsg);
      results.push({
        taskId,
        taskName: 'Snapshot Creation',
        success: false,
        error: errorMsg,
        executedAt: new Date(),
      });
    }

    logger.info('SchedulerService.runSnapshotCreate completed', { vaultCount: results.length });

    return results;
  }

  /**
   * Run snapshot expiration cleanup
   * Removes expired snapshots based on retention policy
   */
  async runSnapshotExpire(vaultId?: string): Promise<CleanupTaskResult[]> {
    const taskId = 'snapshot-expire';
    const results: CleanupTaskResult[] = [];

    logger.info('SchedulerService.runSnapshotExpire started', { vaultId });

    try {
      this.updateTaskStatus(taskId, 'running');

      // Get vaults to process
      const vaultsToProcess = await this.getVaultsToProcess(vaultId);

      for (const vault of vaultsToProcess) {
        const releaseLock = await this.acquireVaultLock(vault.id);

        try {
          // Query and delete expired snapshots
          const deletedCount = await this.expireSnapshots(vault.id);

          results.push({
            taskId,
            taskName: 'Snapshot Expiration',
            success: true,
            deletedCount,
            executedAt: new Date(),
          });
        } finally {
          try { releaseLock(); } catch { /* log only */ }
        }
      }

      this.updateTaskStatus(taskId, 'completed');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.updateTaskError(taskId, errorMsg);
      results.push({
        taskId,
        taskName: 'Snapshot Expiration',
        success: false,
        error: errorMsg,
        executedAt: new Date(),
      });
    }

    logger.info('SchedulerService.runSnapshotExpire completed', {
      vaultCount: results.length,
      successCount: results.filter((r) => r.success).length,
    });

    return results;
  }

  /**
   * Run all cleanup tasks
   */
  async runAllCleanupTasks(vaultId?: string): Promise<Map<string, CleanupTaskResult[]>> {
    const results = new Map<string, CleanupTaskResult[]>();

    logger.info('SchedulerService.runAllCleanupTasks started', { vaultId });

    // Run tasks sequentially to avoid resource contention
    // Each task handles its own vault-level locking
    results.set('orphan-blob-cleanup', await this.runOrphanBlobCleanup(vaultId));
    results.set('tombstone-retention-cleanup', await this.runTombstoneRetentionCleanup(vaultId));
    results.set('snapshot-expire', await this.runSnapshotExpire(vaultId));

    logger.info('SchedulerService.runAllCleanupTasks completed', {
      taskCount: results.size,
    });

    return results;
  }

  /**
   * Get execution status for all tasks
   */
  getTaskStatuses(): TaskExecution[] {
    return Array.from(this.taskExecutions.values());
  }

  /**
   * Get execution status for a specific task
   */
  getTaskStatus(taskId: string): TaskExecution | null {
    return this.taskExecutions.get(taskId) ?? null;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get vaults to process, optionally filtered by vaultId
   */
  private async getVaultsToProcess(vaultId?: string): Promise<typeof vaults.$inferSelect[]> {
    const db = getDb();

    if (vaultId) {
      const result = await db.select().from(vaults).where(eq(vaults.id, vaultId)).limit(1);
      return result;
    }

    // Return all active vaults
    return db.select().from(vaults);
  }

  /**
   * Acquire vault-level lock for serialization
   * Returns a release function that must be called when done
   */
  private async acquireVaultLock(vaultId: string): Promise<() => void> {
    // Robust async mutex: atomically check-and-set to prevent race conditions
    // between checking existingLock and storing new lockPromise
    while (true) {
      const existingLock = this.vaultLocks.get(vaultId);
      if (!existingLock) {
        // No existing lock - try to acquire one
        let release: () => void;
        const lockPromise = new Promise<void>((resolve) => {
          release = resolve;
        });
        // Atomically check if lock is still empty, if so set our lock
        const current = this.vaultLocks.get(vaultId);
        if (current === undefined) {
          // Lock is still available, set it
          this.vaultLocks.set(vaultId, lockPromise);
          return () => {
            this.vaultLocks.delete(vaultId);
            release!();
          };
        }
        // Lock was set by another coroutine, await their lock instead
        await existingLock;
        // Loop back and try to acquire again
      } else {
        // Another task holds the lock, wait for it
        await existingLock;
        // Loop back and try to acquire again
      }
    }
  }

  /**
   * Update task status
   */
  private updateTaskStatus(taskId: string, status: TaskExecution['status']): void {
    const execution = this.taskExecutions.get(taskId);
    if (execution) {
      execution.status = status;
      execution.lastRunAt = new Date();
      if (status === 'completed') {
        execution.executionCount++;
      }
    }

    logger.debug('SchedulerService task status updated', { taskId, status });
  }

  /**
   * Update task error
   */
  private updateTaskError(taskId: string, error: string): void {
    const execution = this.taskExecutions.get(taskId);
    if (execution) {
      execution.status = 'failed';
      execution.lastError = error;
      execution.lastErrorAt = new Date();
      execution.executionCount++;
    }

    logger.error('SchedulerService task failed', { taskId, error });
  }

  /**
   * Expire old snapshots based on retention policy
   * Deletes succeeded snapshots older than retention period
   */
  private async expireSnapshots(vaultId: string): Promise<number> {
    const db = getDb();

    // Calculate expiration cutoff
    const expirationCutoff = new Date();
    expirationCutoff.setDate(expirationCutoff.getDate() - this.defaultSnapshotRetentionDays);

    // Get count of old succeeded snapshots before deletion
    const oldSnapshots = await db
      .select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.vaultId, vaultId),
          eq(snapshots.status, 'succeeded'),
          lt(snapshots.finishedAt, expirationCutoff)
        )
      );

    // Delete old succeeded snapshots
    await db
      .delete(snapshots)
      .where(
        and(
          eq(snapshots.vaultId, vaultId),
          eq(snapshots.status, 'succeeded'),
          lt(snapshots.finishedAt, expirationCutoff)
        )
      );

    // Note: This is simplified. In production, you'd want to:
    // 1. Only delete succeeded snapshots (not pending/running/failed)
    // 2. Check if any are currently being restored
    // 3. Write audit logs for each deletion

    return oldSnapshots.length;
  }
}
