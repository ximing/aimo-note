import type { Database } from 'better-sqlite3';
import type { SyncDevice } from '@aimo-note/dto';
import { DeviceManager } from './device.js';
import { ChangeLogger } from './change_logger.js';
import { VersionManager } from './version_manager.js';
import { Watcher } from './file_watcher.js';
import { initDatabase } from './db.js';

export interface SyncServiceConfig {
  vaultPath: string;
  deviceId: string;
  deviceName: string;
}

export class SyncService {
  private deviceManager: DeviceManager;
  private changeLogger: ChangeLogger;
  private versionManager: VersionManager;
  private watcher: Watcher | null = null;
  private isRunning = false;
  private deviceId: string;
  private vaultPath: string;

  constructor(
    config: SyncServiceConfig,
    db: Database
  ) {
    // Initialize schema
    initDatabase(db);

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
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startWatching(this.vaultPath);
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
