import { SyncDevice, SyncChangeLogEntry, SyncOperation } from '../sync.js';

describe('SyncDevice', () => {
  it('has required fields', () => {
    const device: SyncDevice = {
      id: 'device-1',
      name: 'My Device',
      lastSeen: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    expect(device.id).toBe('device-1');
    expect(device.name).toBe('My Device');
    expect(device.lastSeen).toBe('2024-01-01T00:00:00.000Z');
    expect(device.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });
});

describe('SyncChangeLogEntry', () => {
  it('supports upsert operation', () => {
    const entry: SyncChangeLogEntry = {
      operation: 'upsert' as SyncOperation,
      filePath: '/notes/test.md',
      version: '1.0.0',
      hash: 'abc123',
      createdAt: '2024-01-01T00:00:00.000Z',
      deviceId: 'device-1',
      synced: false,
    };

    expect(entry.operation).toBe('upsert');
    expect(entry.filePath).toBe('/notes/test.md');
    expect(entry.synced).toBe(false);
  });
});