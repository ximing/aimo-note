import BetterSqlite3 from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';
import { DeviceManager } from '../device';
import { VersionManager } from '../version_manager';
import type { SyncFileVersion } from '@aimo-note/dto';

describe('VersionManager', () => {
  let db: InstanceType<typeof BetterSqlite3>;
  let versionManager: VersionManager;
  let deviceManager: DeviceManager;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    initDatabase(db);
    setDatabase(db);
    deviceManager = new DeviceManager(db);
    deviceManager.register('device-001', 'Test Device');
    versionManager = new VersionManager(db, 'device-001', '/tmp/aimo-test-versions');
  });

  afterEach(() => {
    db.close();
  });

  it('should create a new version', () => {
    const version = versionManager.createVersion(
      'note1.md',
      'v1',
      'sha256:abc123',
      'initial content'
    );

    expect(version.filePath).toBe('note1.md');
    expect(version.version).toBe('v1');
    expect(version.hash).toBe('sha256:abc123');
    expect(version.message).toBe('');
  });

  it('should get version history for a file', () => {
    versionManager.createVersion('note1.md', 'v1', 'sha256:abc123', 'content1');
    versionManager.createVersion('note1.md', 'v2', 'sha256:def456', 'content2');

    const history = versionManager.getFileHistory('note1.md');
    expect(history.length).toBe(2);
    expect(history[0].version).toBe('v2'); // Most recent first
    expect(history[1].version).toBe('v1');
  });

  it('should get latest version of a file', () => {
    versionManager.createVersion('note1.md', 'v1', 'sha256:abc123', 'content1');
    versionManager.createVersion('note1.md', 'v2', 'sha256:def456', 'content2');

    const latest = versionManager.getLatestVersion('note1.md');
    expect(latest?.version).toBe('v2');
  });

  it('should get specific version', () => {
    versionManager.createVersion('note1.md', 'v1', 'sha256:abc123', 'content1');

    const version = versionManager.getVersion('note1.md', 'v1');
    expect(version?.version).toBe('v1');
    expect(version?.hash).toBe('sha256:abc123');
  });

  it('should mark file as deleted', () => {
    versionManager.createVersion('note1.md', 'v1', 'sha256:abc123', 'content1');
    versionManager.markDeleted('note1.md', 'v2', 'sha256:deleted');

    const history = versionManager.getFileHistory('note1.md');
    expect(history[0].isDeleted).toBe(true);
  });

  it('should get latest version content', () => {
    versionManager.createVersion('note1.md', 'v1', 'sha256:abc123', 'content1');

    const content = versionManager.getVersionContent('note1.md', 'v1');
    expect(content).toBe('content1');
  });
});
