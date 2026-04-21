import type { Database } from 'better-sqlite3';
import type { SyncDevice, S3Config, SyncConflictRecord, RollbackResult, GcConfig, GcResult, ManifestCompactionResult } from '@aimo-note/dto';
import { DeviceManager } from './device';
import { ChangeLogger } from './change_logger';
import { VersionManager } from './version_manager';
import { Watcher } from './file_watcher';
import { S3Adapter } from './adapter';
import { ManifestManager } from './manifest';
import { SyncEngine } from './engine';
import { ConflictManager } from './conflicts';
import { VersionRollback } from './rollback';
import { GarbageCollector } from './gc';
import { ManifestCompactor } from './manifest_compactor';

export interface SyncServiceConfig {
  vaultPath: string;
  deviceId: string;
  deviceName: string;
  s3?: S3Config; // Optional — Phase 2 sync disabled if not provided
}

export class SyncService {
  private deviceManager: DeviceManager;
  private changeLogger: ChangeLogger;
  private versionManager: VersionManager;
  private watcher: Watcher | null = null;
  private isRunning = false;
  private deviceId: string;
  private vaultPath: string;
  // NEW Phase 2 fields:
  private s3Config?: S3Config;
  private adapter: S3Adapter | null = null;
  private syncEngine: SyncEngine | null = null;
  private manifestManager: ManifestManager | null = null;
  private conflictManager: ConflictManager;
  private versionRollback: VersionRollback;
  private gc: GarbageCollector;
  private compactor: ManifestCompactor | null = null;

  constructor(
    config: SyncServiceConfig,
    db: Database
  ) {
    // Validate schema is initialized before proceeding
    try {
      db.prepare('SELECT 1 FROM sync_devices').get();
    } catch {
      throw new Error(
        'Database schema not initialized. ' +
        'Call initDatabase(db) before creating SyncService.'
      );
    }

    // Store deviceId for later use
    this.deviceId = config.deviceId;

    // Store vaultPath for later use
    this.vaultPath = config.vaultPath;

    // Initialize managers
    this.deviceManager = new DeviceManager(db);
    this.changeLogger = new ChangeLogger(db, config.deviceId);
    this.versionManager = new VersionManager(
      db,
      config.deviceId,
      `${config.vaultPath}/.aimo/versions`
    );

    // Register this device
    this.deviceManager.register(config.deviceId, config.deviceName);

    // Initialize ConflictManager
    this.conflictManager = new ConflictManager(db);

    // Phase 2: Initialize S3 if config provided
    if (config.s3) {
      this.s3Config = config.s3;
      this.adapter = new S3Adapter(config.s3);
      this.manifestManager = new ManifestManager(this.adapter, config.deviceId);
      this.syncEngine = new SyncEngine(
        this.adapter,
        this.versionManager,
        this.changeLogger,
        config.deviceId,
        this.conflictManager,  // NEW
        config.vaultPath        // NEW
      );
    }

    // Initialize VersionRollback after Phase 2 adapter is set
    this.versionRollback = new VersionRollback(
      this.versionManager,
      this.adapter,  // S3Adapter (null if sync not configured)
      config.vaultPath
    );

    // Phase 4: Initialize GarbageCollector and ManifestCompactor
    this.gc = new GarbageCollector(
      db,
      this.versionManager,
      this.adapter,  // S3Adapter (null if sync not configured)
      config.vaultPath,
      config.deviceId
    );

    if (this.adapter && this.manifestManager) {
      this.compactor = new ManifestCompactor(this.adapter, this.manifestManager);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      this.startWatching(this.vaultPath);
    } catch (err) {
      this.isRunning = false;
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
  }

  [Symbol.dispose](): void {
    this.stop();
  }

  getDevice(): SyncDevice | null {
    return this.deviceManager.getDevice(this.deviceId);
  }

  getChangeLogger(): ChangeLogger {
    return this.changeLogger;
  }

  getVersionManager(): VersionManager {
    return this.versionManager;
  }

  getDeviceManager(): DeviceManager {
    return this.deviceManager;
  }

  // NEW Phase 2 methods:

  isSyncConfigured(): boolean {
    return this.s3Config !== undefined;
  }

  getAdapter(): S3Adapter | null {
    return this.adapter;
  }

  getSyncEngine(): SyncEngine | null {
    return this.syncEngine;
  }

  getManifestManager(): ManifestManager | null {
    return this.manifestManager;
  }

  // Phase 3 methods:

  /**
   * Get all unresolved conflicts.
   */
  getConflicts(): SyncConflictRecord[] {
    return this.conflictManager.getUnresolved();
  }

  /**
   * Get unresolved conflicts for a specific file.
   */
  getConflictsForFile(filePath: string): SyncConflictRecord[] {
    return this.conflictManager.getUnresolvedForFile(filePath);
  }

  /**
   * Mark a conflict as resolved.
   */
  resolveConflict(conflictId: number, resolutionPath: string): void {
    this.conflictManager.resolve(conflictId, resolutionPath);
  }

  /**
   * Rollback a file to a specific version.
   * Non-destructive: creates a new version entry.
   */
  async rollback(filePath: string, targetVersion: string): Promise<RollbackResult> {
    return this.versionRollback.rollback(filePath, targetVersion);
  }

  // Phase 4 methods:

  /**
   * Run garbage collection on local (and optionally remote) versions.
   * Call this periodically — e.g., once per day or after each sync.
   */
  async runGc(config?: GcConfig): Promise<GcResult> {
    return this.gc.gc(config ?? {});
  }

  /**
   * Compact the remote manifest by removing stale deleted entries.
   * Only applies if sync is configured (S3).
   * Call this after GC runs successfully.
   */
  async compactManifest(maxAgeDays = 30): Promise<ManifestCompactionResult | null> {
    if (!this.compactor) return null;
    return this.compactor.compact({ maxAgeDays });
  }

  // Start watching for file changes
  startWatching(vaultPath: string): void {
    if (!this.isRunning) return;

    if (this.watcher) {
      this.watcher.stop();
    }

    this.watcher = new Watcher(vaultPath, (event) => {
      // When a file changes, log it and create a new version
      if (event.type === 'create' || event.type === 'update') {
        // Content will be read by the caller
        this.changeLogger.logUpsert(
          event.path,
          'v1', // Version will be determined by caller
          ''    // Hash will be computed by caller
        );
      } else if (event.type === 'delete') {
        this.changeLogger.logDelete(event.path, 'v1', null);
      }
    });
  }
}
