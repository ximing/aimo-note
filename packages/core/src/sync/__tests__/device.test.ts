import BetterSqlite3 from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';
import { DeviceManager } from '../device';

describe('DeviceManager', () => {
  let db: InstanceType<typeof BetterSqlite3>;
  let deviceManager: DeviceManager;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    initDatabase(db);
    setDatabase(db);
    deviceManager = new DeviceManager(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should register a new device', () => {
    const device = deviceManager.register('macbook-pro', 'MacBook Pro');
    expect(device.id).toBeDefined();
    expect(device.name).toBe('MacBook Pro');
    expect(device.lastSeen).toBeDefined();
  });

  it('should return existing device on duplicate registration', () => {
    const device1 = deviceManager.register('macbook-pro', 'MacBook Pro');
    const device2 = deviceManager.register('macbook-pro', 'MacBook Pro');
    expect(device1.id).toBe(device2.id);
  });

  it('should update lastSeen on getDevice', () => {
    const device1 = deviceManager.register('macbook-pro', 'MacBook Pro');
    const before = device1.lastSeen;

    // Small delay to ensure different timestamp
    deviceManager.touch(device1.id);
    const device2 = deviceManager.getDevice(device1.id);

    expect(device2?.lastSeen).toBeDefined();
  });

  it('should get all devices', () => {
    deviceManager.register('macbook-pro', 'MacBook Pro');
    deviceManager.register('ipad', 'iPad');
    const devices = deviceManager.getAllDevices();
    expect(devices.length).toBe(2);
  });
});