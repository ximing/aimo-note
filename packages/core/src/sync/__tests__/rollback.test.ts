import BetterSqlite3 from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';
import { VersionRollback } from '../rollback';
import { VersionManager } from '../version_manager';
import { DeviceManager } from '../device';
import type { S3Adapter } from '../adapter';
import { rmSync, mkdirSync } from 'fs';

const mockAdapter = {
  getObject: jest.fn(),
} as any as S3Adapter;

describe('VersionRollback', () => {
  let db: InstanceType<typeof BetterSqlite3>;
  let versionManager: VersionManager;
  let rollback: VersionRollback;
  const vaultPath = '/tmp/aimo-rollback-test';

  beforeAll(() => {
    mkdirSync(vaultPath, { recursive: true });
  });

  afterAll(() => {
    rmSync(vaultPath, { recursive: true, force: true });
  });

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    initDatabase(db);
    setDatabase(db);
    const deviceManager = new DeviceManager(db);
    deviceManager.register('device-001', 'Test Device');
    versionManager = new VersionManager(db, 'device-001', `${vaultPath}/.aimo/versions`);
    rollback = new VersionRollback(versionManager, mockAdapter, vaultPath);
    jest.clearAllMocks();
  });

  afterEach(() => {
    db.close();
  });

  describe('rollback', () => {
    it('should restore a local version to the vault', async () => {
      versionManager.createVersion('note1.md', 'v1', 'sha256:v1hash', 'content version 1');
      versionManager.createVersion('note1.md', 'v2', 'sha256:v2hash', 'content version 2');

      const result = await rollback.rollback('note1.md', 'v1');

      expect(result.restoredVersion).toBe('v1');
      expect(result.newVersion).toMatch(/^v\d+$/);
      expect(result.content).toBe('content version 1');
    });

    it('should fetch version from S3 when not available locally', async () => {
      versionManager.createVersion('note1.md', 'v2', 'sha256:v2hash', 'content version 2');
      mockAdapter.getObject.mockResolvedValueOnce('content version 1');

      const result = await rollback.rollback('note1.md', 'v1');

      expect(result.restoredVersion).toBe('v1');
      expect(result.content).toBe('content version 1');
      expect(mockAdapter.getObject).toHaveBeenCalledWith('.aimo/versions/note1.md/v1.content');
    });

    it('should throw when target version does not exist', async () => {
      versionManager.createVersion('note1.md', 'v1', 'sha256:v1hash', 'content version 1');
      mockAdapter.getObject.mockResolvedValue(null);

      await expect(rollback.rollback('note1.md', 'nonexistent')).rejects.toThrow(
        'Version nonexistent not found for note1.md'
      );
    });

    it('should increment version counter for the restored file', () => {
      versionManager.createVersion('note1.md', 'v1', 'sha256:v1hash', 'content v1');
      versionManager.createVersion('note1.md', 'v2', 'sha256:v2hash', 'content v2');

      rollback.rollback('note1.md', 'v1');
      rollback.rollback('note1.md', 'v1');

      const history = versionManager.getFileHistory('note1.md');
      const versions = history.map(v => v.version);
      expect(versions).toContain('v1');
      expect(versions).toContain('v2');
    });
  });
});
