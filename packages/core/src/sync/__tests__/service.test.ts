import BetterSqlite3 from 'better-sqlite3';
import { initDatabase } from '../db';
import { SyncService } from '../service';
import type { SyncServiceConfig } from '../service';

describe('SyncService', () => {
  let db: InstanceType<typeof BetterSqlite3>;
  let syncService: SyncService;

  const config: SyncServiceConfig = {
    vaultPath: '/tmp/aimo-test-vault',
    deviceId: 'test-device-001',
    deviceName: 'Test Device',
  };

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    initDatabase(db);
    syncService = new SyncService(config, db);
  });

  afterEach(async () => {
    await syncService.stop();
    db.close();
  });

  it('should initialize and register device', async () => {
    await syncService.start();

    const device = syncService.getDevice();
    expect(device).not.toBeNull();
    expect(device!.id).toBe('test-device-001');
    expect(device!.name).toBe('Test Device');
  });

  it('should get change logger', () => {
    const logger = syncService.getChangeLogger();
    expect(logger).toBeDefined();
  });

  it('should get version manager', () => {
    const vm = syncService.getVersionManager();
    expect(vm).toBeDefined();
  });
});
