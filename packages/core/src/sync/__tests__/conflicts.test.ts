import { Database } from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';
import { ConflictManager } from '../conflicts';
import type { SyncConflictRecord } from '@aimo-note/dto';

describe('ConflictManager', () => {
  let db: Database.Database;
  let conflictManager: ConflictManager;

  beforeEach(() => {
    db = new (require('better-sqlite3'))(':memory:');
    initDatabase(db);
    setDatabase(db);
    conflictManager = new ConflictManager(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('record', () => {
    it('should insert a conflict record', () => {
      const record = conflictManager.record({
        filePath: 'note1.md',
        localVersion: 'v2',
        remoteVersion: 'v2',
        localHash: 'sha256:local',
        remoteHash: 'sha256:remote',
      });

      expect(record.id).toBeDefined();
      expect(record.filePath).toBe('note1.md');
      expect(record.resolved).toBe(false);
      expect(record.resolutionPath).toBeNull();
    });

    it('should generate a conflict filename', () => {
      const name = conflictManager.generateConflictFilename('note1.md');
      expect(name).toMatch(/^note1_conflict_\d{8}_\d{6}_[a-z0-9]{4}\.md$/);
    });

    it('should preserve extension in conflict filename', () => {
      const name = conflictManager.generateConflictFilename('note1.md');
      expect(name.endsWith('.md')).toBe(true);
    });
  });

  describe('getUnresolved', () => {
    it('should return only unresolved conflicts', () => {
      conflictManager.record({
        filePath: 'note1.md',
        localVersion: 'v1',
        remoteVersion: 'v1',
        localHash: 'sha256:a',
        remoteHash: 'sha256:b',
      });
      conflictManager.record({
        filePath: 'note2.md',
        localVersion: 'v1',
        remoteVersion: 'v1',
        localHash: 'sha256:c',
        remoteHash: 'sha256:d',
      });

      const unresolved = conflictManager.getUnresolved();
      expect(unresolved).toHaveLength(2);
    });

    it('should return empty array when no conflicts', () => {
      const unresolved = conflictManager.getUnresolved();
      expect(unresolved).toHaveLength(0);
    });
  });

  describe('getUnresolvedForFile', () => {
    it('should return unresolved conflicts for a specific file', () => {
      conflictManager.record({
        filePath: 'note1.md',
        localVersion: 'v1',
        remoteVersion: 'v1',
        localHash: 'sha256:a',
        remoteHash: 'sha256:b',
      });
      conflictManager.record({
        filePath: 'note2.md',
        localVersion: 'v1',
        remoteVersion: 'v1',
        localHash: 'sha256:c',
        remoteHash: 'sha256:d',
      });

      const note1Conflicts = conflictManager.getUnresolvedForFile('note1.md');
      expect(note1Conflicts).toHaveLength(1);
      expect(note1Conflicts[0].filePath).toBe('note1.md');
    });
  });

  describe('resolve', () => {
    it('should mark a conflict as resolved with a resolution path', () => {
      const record = conflictManager.record({
        filePath: 'note1.md',
        localVersion: 'v1',
        remoteVersion: 'v1',
        localHash: 'sha256:a',
        remoteHash: 'sha256:b',
      });

      conflictManager.resolve(record.id, 'note1_conflict_20260420_143052.md');

      const unresolved = conflictManager.getUnresolved();
      expect(unresolved).toHaveLength(0);

      const resolved = conflictManager.getById(record.id);
      expect(resolved?.resolved).toBe(true);
      expect(resolved?.resolutionPath).toBe('note1_conflict_20260420_143052.md');
    });
  });

  describe('getById', () => {
    it('should retrieve a conflict by id', () => {
      const record = conflictManager.record({
        filePath: 'note1.md',
        localVersion: 'v1',
        remoteVersion: 'v1',
        localHash: 'sha256:a',
        remoteHash: 'sha256:b',
      });

      const found = conflictManager.getById(record.id);
      expect(found?.id).toBe(record.id);
      expect(found?.filePath).toBe('note1.md');
    });
  });
});
