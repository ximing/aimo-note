import BetterSqlite3 from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';
import { ChangeLogger } from '../change_logger';
import type { SyncChangeLogEntry, SyncOperation } from '@aimo-note/dto';

describe('ChangeLogger', () => {
  let db: InstanceType<typeof BetterSqlite3>;
  let changeLogger: ChangeLogger;

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    initDatabase(db);
    setDatabase(db);
    changeLogger = new ChangeLogger(db, 'device-001');
  });

  afterEach(() => {
    db.close();
  });

  it('should log upsert operation', () => {
    changeLogger.logUpsert('note1.md', 'v1', 'sha256:abc123');

    const entries = changeLogger.getUnsyncedEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].operation).toBe('upsert');
    expect(entries[0].filePath).toBe('note1.md');
    expect(entries[0].version).toBe('v1');
    expect(entries[0].synced).toBe(false);
  });

  it('should log delete operation', () => {
    changeLogger.logDelete('note2.md', 'v1', 'sha256:def456');

    const entries = changeLogger.getUnsyncedEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].operation).toBe('delete');
    expect(entries[0].filePath).toBe('note2.md');
  });

  it('should mark entries as synced', () => {
    changeLogger.logUpsert('note1.md', 'v1', 'sha256:abc123');

    const entries = changeLogger.getUnsyncedEntries();
    expect(entries.length).toBe(1);

    changeLogger.markSynced([entries[0].id!]);

    const unsynced = changeLogger.getUnsyncedEntries();
    expect(unsynced.length).toBe(0);
  });

  it('should get entries since last sync', () => {
    const before = '2026-04-20T08:00:00Z';
    const after = '2026-04-20T09:00:00Z';

    changeLogger.logUpsert('note1.md', 'v1', 'sha256:abc123');
    changeLogger.logUpsert('note2.md', 'v2', 'sha256:def456');

    const entries = changeLogger.getEntriesSince(before);
    expect(entries.length).toBe(2);
  });

  it('should get all entries for a file', () => {
    changeLogger.logUpsert('note1.md', 'v1', 'sha256:abc123');
    changeLogger.logUpsert('note1.md', 'v2', 'sha256:def456');

    const entries = changeLogger.getEntriesForFile('note1.md');
    expect(entries.length).toBe(2);
  });
});
