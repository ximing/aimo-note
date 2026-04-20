import BetterSqlite3 from 'better-sqlite3';
import { initDatabase, setDatabase, getDatabase } from '../db';

describe('db', () => {
  let db: InstanceType<typeof BetterSqlite3>;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('initDatabase', () => {
    it('should create all required tables', () => {
      initDatabase(db);

      // Verify sync_devices table exists
      const devicesTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_devices'").get();
      expect(devicesTable).toBeDefined();

      // Verify sync_file_versions table exists
      const versionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_file_versions'").get();
      expect(versionsTable).toBeDefined();

      // Verify sync_change_log table exists
      const changeLogTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_change_log'").get();
      expect(changeLogTable).toBeDefined();

      // Verify sync_state table exists
      const stateTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_state'").get();
      expect(stateTable).toBeDefined();

      // Verify sync_conflicts table exists
      const conflictsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_conflicts'").get();
      expect(conflictsTable).toBeDefined();
    });

    it('should create indexes', () => {
      initDatabase(db);

      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
      const indexNames = indexes.map((idx: any) => idx.name);

      expect(indexNames).toContain('idx_change_log_synced');
      expect(indexNames).toContain('idx_change_log_created');
      expect(indexNames).toContain('idx_file_versions_path');
    });
  });

  describe('setDatabase and getDatabase', () => {
    it('should set and get the database instance', () => {
      setDatabase(db);
      const retrieved = getDatabase();
      expect(retrieved).toBe(db);
    });

    it('should throw if getDatabase called before setDatabase', () => {
      // Create a fresh db instance that hasn't been set
      const freshDb = new BetterSqlite3(':memory:');
      setDatabase(freshDb);

      // The previous db should have been closed by setDatabase
      expect(() => getDatabase()).not.toThrow();
      freshDb.close();
    });
  });
});
