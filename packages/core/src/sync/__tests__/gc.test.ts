// packages/core/src/sync/__tests__/gc.test.ts
import BetterSqlite3 from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';
import { GarbageCollector } from '../gc';
import { VersionManager } from '../version_manager';
import { DeviceManager } from '../device';
import type { S3Adapter } from '../adapter';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const mockAdapter = {
  deleteObject: jest.fn().mockResolvedValue(undefined),
} as any as S3Adapter;

describe('GarbageCollector', () => {
  let db: InstanceType<typeof BetterSqlite3>;
  let versionManager: VersionManager;
  let gc: GarbageCollector;
  const vaultPath = '/tmp/aimo-test-vault-gc';

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    initDatabase(db);
    setDatabase(db);
    const deviceManager = new DeviceManager(db);
    deviceManager.register('device-001', 'Test Device');
    versionManager = new VersionManager(db, 'device-001', `${vaultPath}/.aimo/versions`);
    gc = new GarbageCollector(db, versionManager, mockAdapter, vaultPath, 'device-001');
  });

  afterEach(() => {
    db.close();
  });

  describe('gc with maxVersionsPerFile', () => {
    it('should keep only the latest N versions per file', () => {
      // Create 5 versions
      for (let i = 1; i <= 5; i++) {
        versionManager.createVersion('note1.md', `v${i}`, `sha256:hash${i}`, `content ${i}`);
      }

      const result = gc.gc({ maxVersionsPerFile: 2 });

      expect(result.filesCleaned).toContain('note1.md');
      // v1, v2 should be removed (keeping latest 2: v5, v4)
      expect(versionManager.getLatestVersion('note1.md')?.version).toBe('v5');
      const history = versionManager.getFileHistory('note1.md');
      expect(history).toHaveLength(2);
      expect(history.map(v => v.version).sort()).toEqual(['v4', 'v5']);
    });

    it('should never delete the only version of a file', () => {
      versionManager.createVersion('note1.md', 'v1', 'sha256:h1', 'content 1');

      const result = gc.gc({ maxVersionsPerFile: 1 });

      const history = versionManager.getFileHistory('note1.md');
      expect(history).toHaveLength(1);
      expect(history[0].version).toBe('v1');
    });

    it('should not affect other files when cleaning one file', () => {
      versionManager.createVersion('note1.md', 'v1', 'sha256:h1', 'content 1');
      versionManager.createVersion('note1.md', 'v2', 'sha256:h2', 'content 2');
      versionManager.createVersion('note2.md', 'v1', 'sha256:h3', 'content 3');

      gc.gc({ maxVersionsPerFile: 1 });

      const note2History = versionManager.getFileHistory('note2.md');
      expect(note2History).toHaveLength(1);
    });

    it('should delete version files from disk when removing from DB', () => {
      versionManager.createVersion('note1.md', 'v1', 'sha256:h1', 'content 1');
      versionManager.createVersion('note1.md', 'v2', 'sha256:h2', 'content 2');
      versionManager.createVersion('note1.md', 'v3', 'sha256:h3', 'content 3');

      gc.gc({ maxVersionsPerFile: 1 });

      const contentPath = join(`${vaultPath}/.aimo/versions/note1.md/v1.content`);
      expect(existsSync(contentPath)).toBe(false);
    });
  });

  describe('gc with maxVersionAgeDays', () => {
    it('should delete versions older than maxVersionAgeDays', () => {
      // Create an old version directly in DB with old timestamp
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);
      const oldTimestamp = oldDate.toISOString();

      db.prepare(`
        INSERT INTO sync_file_versions
          (file_path, version, hash, content_path, created_at, device_id, message, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).run('note1.md', 'vOld', 'sha256:oldhash', join(vaultPath, '.aimo/versions/note1.md/vOld.content'), oldTimestamp, 'device-001', 'old version');

      // Write the old file to disk so cleanup can delete it
      const { mkdirSync, writeFileSync } = require('fs');
      mkdirSync(join(vaultPath, '.aimo/versions/note1.md'), { recursive: true });
      writeFileSync(join(vaultPath, '.aimo/versions/note1.md/vOld.content'), 'old content');

      // Create a recent version
      versionManager.createVersion('note1.md', 'v2', 'sha256:newhash', 'new content');

      const result = gc.gc({ maxVersionAgeDays: 30 });

      expect(result.versionsRemoved).toBeGreaterThanOrEqual(1);
      const history = versionManager.getFileHistory('note1.md');
      expect(history.find(v => v.version === 'vOld')).toBeUndefined();
    });
  });

  describe('gc with cleanRemote', () => {
    it('should delete old S3 versions when cleanRemote is true', async () => {
      versionManager.createVersion('note1.md', 'v1', 'sha256:h1', 'content 1');
      versionManager.createVersion('note1.md', 'v2', 'sha256:h2', 'content 2');
      versionManager.createVersion('note1.md', 'v3', 'sha256:h3', 'content 3');

      await gc.gc({ maxVersionsPerFile: 1, cleanRemote: true });

      expect(mockAdapter.deleteObject).toHaveBeenCalledWith('.aimo/versions/note1.md/v1.content');
      expect(mockAdapter.deleteObject).toHaveBeenCalledWith('.aimo/versions/note1.md/v1.json');
    });
  });

  describe('gc with deleted files', () => {
    it('should clean up versions of deleted files', () => {
      versionManager.createVersion('note1.md', 'v1', 'sha256:h1', 'content 1');
      versionManager.createVersion('note1.md', 'v2', 'sha256:h2', 'content 2');
      versionManager.markDeleted('note1.md', 'v2', 'sha256:h2');

      gc.gc({ maxVersionsPerFile: 1 });

      const history = versionManager.getFileHistory('note1.md');
      // Should still have the deleted v2 marker, but v1 should be removed
      const nonDeleted = history.filter(v => !v.isDeleted);
      expect(nonDeleted).toHaveLength(1);
      expect(nonDeleted[0].version).toBe('v2');
    });
  });
});
