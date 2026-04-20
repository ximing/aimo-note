# Vault Sync Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build local SQLite database + file watcher + change logger foundation for vault sync

**Architecture:** Local-first sync using SQLite as metadata store, chokidar for file watching, and a change log for tracking all vault mutations. Phase 1 focuses on local-only functionality without S3 sync.

**Tech Stack:** better-sqlite3 (synchronous SQLite), chokidar, crypto (Node.js built-in)

---

## File Structure

```
packages/core/src/sync/
├── index.ts                    ← Public exports
├── db.ts                      ← SQLite connection + schema init
├── schema.sql                 ← SQL schema definitions
├── types.ts                   ← Sync-specific types
├── device.ts                  ← Device registration
├── change_logger.ts           ← Change log writer
├── version_manager.ts         ← Version CRUD
├── file_watcher.ts            ← Chokidar wrapper
└── __tests__/
    ├── db.test.ts
    ├── change_logger.test.ts
    └── version_manager.test.ts

packages/dto/src/
└── sync.ts                    ← Shared sync types (SyncDevice, SyncChangeLog, etc.)
```

---

## Chunk 1: Schema + Database Foundation

### Task 1: Define sync types in dto

**Files:**
- Create: `packages/dto/src/sync.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/dto/src/__tests__/sync.test.ts
import type { SyncDevice, SyncChangeLogEntry, SyncFileVersion } from '../sync';

describe('sync types', () => {
  it('SyncDevice should have required fields', () => {
    const device: SyncDevice = {
      id: 'test-device-001',
      name: 'Test MacBook',
      lastSeen: '2026-04-20T10:00:00Z',
      createdAt: '2026-04-20T10:00:00Z',
    };
    expect(device.id).toBe('test-device-001');
  });

  it('SyncChangeLogEntry should support upsert operation', () => {
    const entry: SyncChangeLogEntry = {
      id: 1,
      operation: 'upsert',
      filePath: 'note1.md',
      version: 'v1',
      hash: 'sha256:abc123',
      createdAt: '2026-04-20T10:00:00Z',
      deviceId: 'device-001',
      synced: false,
    };
    expect(entry.operation).toBe('upsert');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aimo-note/dto test`
Expected: FAIL with "Cannot find module '../sync'"

- [ ] **Step 3: Write minimal types**

```typescript
// packages/dto/src/sync.ts

export interface SyncDevice {
  id: string;
  name: string;
  lastSeen: string;
  createdAt: string;
}

export type SyncOperation = 'upsert' | 'delete';

export interface SyncChangeLogEntry {
  id?: number;
  operation: SyncOperation;
  filePath: string;
  version: string;
  hash: string | null;
  createdAt: string;
  deviceId: string;
  synced: boolean;
}

export interface SyncFileVersion {
  id?: number;
  filePath: string;
  version: string;
  hash: string;
  contentPath: string;
  createdAt: string;
  deviceId: string;
  message: string;
  isDeleted: boolean;
}

export interface SyncConflict {
  id?: number;
  filePath: string;
  localVersion: string;
  remoteVersion: string;
  localHash: string;
  remoteHash: string;
  createdAt: string;
  resolved: boolean;
  resolutionPath: string | null;
}

export interface SyncState {
  key: string;
  value: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aimo-note/dto test`
Expected: PASS

- [ ] **Step 5: Update dto index export**

```typescript
// packages/dto/src/index.ts
export * from './sync.js';
```

- [ ] **Step 6: Run tests again**

Run: `pnpm --filter @aimo-note/dto test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/dto/src/sync.ts packages/dto/src/index.ts
git commit -m "feat(dto): add sync types for vault sync"
```

---

### Task 2: Create SQLite schema SQL

**Files:**
- Create: `packages/core/src/sync/schema.sql`

- [ ] **Step 1: Write the SQL schema**

```sql
-- Device registry
CREATE TABLE IF NOT EXISTS sync_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- File versions
CREATE TABLE IF NOT EXISTS sync_file_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  version TEXT NOT NULL,
  hash TEXT NOT NULL,
  content_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  device_id TEXT NOT NULL,
  message TEXT DEFAULT '',
  is_deleted INTEGER DEFAULT 0,
  FOREIGN KEY (device_id) REFERENCES sync_devices(id)
);

-- Change log
CREATE TABLE IF NOT EXISTS sync_change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
  file_path TEXT NOT NULL,
  version TEXT NOT NULL,
  hash TEXT,
  created_at TEXT NOT NULL,
  device_id TEXT NOT NULL,
  synced INTEGER DEFAULT 0,
  FOREIGN KEY (device_id) REFERENCES sync_devices(id)
);

-- Sync state
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Conflicts
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  local_version TEXT NOT NULL,
  remote_version TEXT NOT NULL,
  local_hash TEXT NOT NULL,
  remote_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved INTEGER DEFAULT 0,
  resolution_path TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_change_log_synced ON sync_change_log(synced);
CREATE INDEX IF NOT EXISTS idx_change_log_created ON sync_change_log(created_at);
CREATE INDEX IF NOT EXISTS idx_file_versions_path ON sync_file_versions(file_path);
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/sync/schema.sql
git commit -m "feat(core): add sync SQL schema"
```

---

### Task 3: Create SQLite database module

**Files:**
- Create: `packages/core/src/sync/db.ts`
- Create: `packages/core/src/sync/types.ts`
- Create: `packages/core/src/sync/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/sync/__tests__/db.test.ts
import { Database } from 'better-sqlite3';
import { initDatabase, getDatabase } from '../db';
import type { SyncDevice } from '@aimo-note/dto';

describe('Database', () => {
  const testDb = new Database(':memory:');

  beforeAll(() => {
    initDatabase(testDb);
  });

  it('should create tables', () => {
    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('sync_devices');
    expect(tableNames).toContain('sync_change_log');
    expect(tableNames).toContain('sync_file_versions');
  });

  it('should register and retrieve device', () => {
    const device: SyncDevice = {
      id: 'test-device-001',
      name: 'Test MacBook',
      lastSeen: '2026-04-20T10:00:00Z',
      createdAt: '2026-04-20T10:00:00Z',
    };

    const stmt = testDb.prepare(`
      INSERT OR REPLACE INTO sync_devices (id, name, last_seen, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(device.id, device.name, device.lastSeen, device.createdAt);

    const result = testDb
      .prepare('SELECT * FROM sync_devices WHERE id = ?')
      .get(device.id) as any;

    expect(result.id).toBe(device.id);
    expect(result.name).toBe(device.name);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/db"`
Expected: FAIL with "Cannot find module '../db'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/sync/types.ts
// Re-export sync types from dto for core usage
export type { SyncDevice, SyncChangeLogEntry, SyncFileVersion, SyncConflict, SyncState, SyncOperation } from '@aimo-note/dto';

// Local-only types for core
export interface SyncConfig {
  vaultPath: string;
  deviceId: string;
  deviceName: string;
}
```

```typescript
// packages/core/src/sync/db.ts
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function initDatabase(database: Database.Database): void {
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Execute each statement separately
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    database.exec(statement);
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.');
  }
  return db;
}

export function setDatabase(database: Database.Database): void {
  db = database;
}
```

```typescript
// packages/core/src/sync/index.ts
export * from './db.js';
export * from './types.js';
export * from './device.js';
export * from './change_logger.js';
export * from './version_manager.js';
export * from './file_watcher.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/db"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/db.ts packages/core/src/sync/types.ts packages/core/src/sync/index.ts
git commit -m "feat(core): add SQLite database module for sync"
```

---

## Chunk 2: Device Registration

### Task 4: Device registration module

**Files:**
- Create: `packages/core/src/sync/device.ts`
- Modify: `packages/core/src/sync/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/sync/__tests__/device.test.ts
import { Database } from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';
import { DeviceManager } from '../device';
import type { SyncDevice } from '@aimo-note/dto';

describe('DeviceManager', () => {
  let db: Database.Database;
  let deviceManager: DeviceManager;

  beforeEach(() => {
    db = new Database(':memory:');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/device"`
Expected: FAIL with "Cannot find module '../device'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/sync/device.ts
import type { Database } from 'better-sqlite3';
import type { SyncDevice } from '@aimo-note/dto';
import { randomUUID } from 'crypto';

export class DeviceManager {
  constructor(private db: Database.Database) {}

  register(id: string, name: string): SyncDevice {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sync_devices (id, name, last_seen, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, name, now, now);

    return { id, name, lastSeen: now, createdAt: now };
  }

  getDevice(id: string): SyncDevice | null {
    const row = this.db
      .prepare('SELECT * FROM sync_devices WHERE id = ?')
      .get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
    };
  }

  getAllDevices(): SyncDevice[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_devices ORDER BY last_seen DESC')
      .all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      lastSeen: row.last_seen,
      createdAt: row.created_at,
    }));
  }

  touch(id: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE sync_devices SET last_seen = ? WHERE id = ?')
      .run(now, id);
  }

  generateDeviceId(): string {
    return `device-${randomUUID().slice(0, 8)}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/device"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/device.ts
git commit -m "feat(core): add DeviceManager for device registration"
```

---

## Chunk 3: Change Logger

### Task 5: Change logger module

**Files:**
- Create: `packages/core/src/sync/change_logger.ts`
- Modify: `packages/core/src/sync/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/sync/__tests__/change_logger.test.ts
import { Database } from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';
import { ChangeLogger } from '../change_logger';
import type { SyncChangeLogEntry, SyncOperation } from '@aimo-note/dto';

describe('ChangeLogger', () => {
  let db: Database.Database;
  let changeLogger: ChangeLogger;

  beforeEach(() => {
    db = new Database(':memory:');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/change_logger"`
Expected: FAIL with "Cannot find module '../change_logger'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/sync/change_logger.ts
import type { Database } from 'better-sqlite3';
import type { SyncChangeLogEntry, SyncOperation } from '@aimo-note/dto';

export class ChangeLogger {
  constructor(
    private db: Database.Database,
    private deviceId: string
  ) {}

  logUpsert(filePath: string, version: string, hash: string): SyncChangeLogEntry {
    return this.log('upsert', filePath, version, hash);
  }

  logDelete(filePath: string, version: string, hash: string | null): SyncChangeLogEntry {
    return this.log('delete', filePath, version, hash);
  }

  private log(
    operation: SyncOperation,
    filePath: string,
    version: string,
    hash: string | null
  ): SyncChangeLogEntry {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO sync_change_log
        (operation, file_path, version, hash, created_at, device_id, synced)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `);
    const result = stmt.run(operation, filePath, version, hash, now, this.deviceId);

    return {
      id: result.lastInsertRowid as number,
      operation,
      filePath,
      version,
      hash,
      createdAt: now,
      deviceId: this.deviceId,
      synced: false,
    };
  }

  getUnsyncedEntries(): SyncChangeLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_change_log WHERE synced = 0 ORDER BY created_at ASC')
      .all() as any[];

    return rows.map(this.mapRow);
  }

  getEntriesSince(since: string): SyncChangeLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_change_log WHERE created_at > ? ORDER BY created_at ASC')
      .all(since) as any[];

    return rows.map(this.mapRow);
  }

  getEntriesForFile(filePath: string): SyncChangeLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_change_log WHERE file_path = ? ORDER BY created_at ASC')
      .all(filePath) as any[];

    return rows.map(this.mapRow);
  }

  markSynced(ids: number[]): void {
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE sync_change_log SET synced = 1 WHERE id IN (${placeholders})`)
      .run(...ids);
  }

  private mapRow(row: any): SyncChangeLogEntry {
    return {
      id: row.id,
      operation: row.operation as SyncOperation,
      filePath: row.file_path,
      version: row.version,
      hash: row.hash,
      createdAt: row.created_at,
      deviceId: row.device_id,
      synced: row.synced === 1,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/change_logger"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/change_logger.ts
git commit -m "feat(core): add ChangeLogger for tracking file mutations"
```

---

## Chunk 4: Version Manager

### Task 6: Version manager module

**Files:**
- Create: `packages/core/src/sync/version_manager.ts`
- Modify: `packages/core/src/sync/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/sync/__tests__/version_manager.test.ts
import { Database } from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';
import { VersionManager } from '../version_manager';
import type { SyncFileVersion } from '@aimo-note/dto';

describe('VersionManager', () => {
  let db: Database.Database;
  let versionManager: VersionManager;

  beforeEach(() => {
    db = new Database(':memory:');
    initDatabase(db);
    setDatabase(db);
    versionManager = new VersionManager(db, 'device-001', '/vault/.aimo/versions');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/version_manager"`
Expected: FAIL with "Cannot find module '../version_manager'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/sync/version_manager.ts
import type { Database } from 'better-sqlite3';
import type { SyncFileVersion } from '@aimo-note/dto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class VersionManager {
  private versionsRoot: string;

  constructor(
    private db: Database.Database,
    private deviceId: string,
    versionsRoot: string
  ) {
    this.versionsRoot = versionsRoot;
  }

  createVersion(
    filePath: string,
    version: string,
    hash: string,
    content: string,
    message = ''
  ): SyncFileVersion {
    const now = new Date().toISOString();
    const contentPath = this.getContentPath(filePath, version);

    // Ensure directory exists
    const dir = join(this.versionsRoot, filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write content file
    writeFileSync(contentPath, content, 'utf-8');

    // Insert record
    const stmt = this.db.prepare(`
      INSERT INTO sync_file_versions
        (file_path, version, hash, content_path, created_at, device_id, message, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);
    const result = stmt.run(filePath, version, hash, contentPath, now, this.deviceId, message);

    return {
      id: result.lastInsertRowid as number,
      filePath,
      version,
      hash,
      contentPath,
      createdAt: now,
      deviceId: this.deviceId,
      message,
      isDeleted: false,
    };
  }

  getFileHistory(filePath: string): SyncFileVersion[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sync_file_versions WHERE file_path = ? ORDER BY created_at DESC'
      )
      .all(filePath) as any[];

    return rows.map(this.mapRow);
  }

  getLatestVersion(filePath: string): SyncFileVersion | null {
    const row = this.db
      .prepare(
        'SELECT * FROM sync_file_versions WHERE file_path = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1'
      )
      .get(filePath) as any;

    if (!row) return null;
    return this.mapRow(row);
  }

  getVersion(filePath: string, version: string): SyncFileVersion | null {
    const row = this.db
      .prepare('SELECT * FROM sync_file_versions WHERE file_path = ? AND version = ?')
      .get(filePath, version) as any;

    if (!row) return null;
    return this.mapRow(row);
  }

  getVersionContent(filePath: string, version: string): string | null {
    const versionRecord = this.getVersion(filePath, version);
    if (!versionRecord) return null;

    try {
      return readFileSync(versionRecord.contentPath, 'utf-8');
    } catch {
      return null;
    }
  }

  markDeleted(filePath: string, version: string, hash: string): SyncFileVersion {
    const now = new Date().toISOString();
    const contentPath = this.getContentPath(filePath, version);

    // Ensure directory exists
    const dir = join(this.versionsRoot, filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write placeholder for deleted file
    writeFileSync(contentPath, '', 'utf-8');

    const stmt = this.db.prepare(`
      INSERT INTO sync_file_versions
        (file_path, version, hash, content_path, created_at, device_id, message, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, 'deleted', 1)
    `);
    const result = stmt.run(filePath, version, hash, contentPath, now, this.deviceId);

    return {
      id: result.lastInsertRowid as number,
      filePath,
      version,
      hash,
      contentPath,
      createdAt: now,
      deviceId: this.deviceId,
      message: 'deleted',
      isDeleted: true,
    };
  }

  private getContentPath(filePath: string, version: string): string {
    return join(this.versionsRoot, filePath, `${version}.content`);
  }

  private mapRow(row: any): SyncFileVersion {
    return {
      id: row.id,
      filePath: row.file_path,
      version: row.version,
      hash: row.hash,
      contentPath: row.content_path,
      createdAt: row.created_at,
      deviceId: row.device_id,
      message: row.message,
      isDeleted: row.is_deleted === 1,
    };
  }

  static computeHash(content: string): string {
    return 'sha256:' + createHash('sha256').update(content).digest('hex');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/version_manager"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/version_manager.ts
git commit -m "feat(core): add VersionManager for file version storage"
```

---

## Chunk 5: File Watcher

### Task 7: File watcher module

**Files:**
- Create: `packages/core/src/sync/file_watcher.ts`
- Modify: `packages/core/src/sync/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/sync/__tests__/file_watcher.test.ts
import { Watcher } from '../file_watcher';
import { watch } from 'chokidar';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

jest.mock('chokidar');

describe('FileWatcher', () => {
  const testDir = '/tmp/aimo-test-watcher';
  let watcher: Watcher;

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true });
  });

  beforeEach(() => {
    (watch as jest.Mock).mockClear();
  });

  it('should create watcher for vault path', () => {
    const callback = jest.fn();
    watcher = new Watcher(testDir, callback);

    expect(watch).toHaveBeenCalled();
  });

  it('should emit create event', () => {
    const callback = jest.fn();
    watcher = new Watcher(testDir, callback);

    // Simulate chokidar event
    const watchInstance = (watch as jest.Mock).mock.results[0].value;
    watchInstance.emit?.('add', 'note1.md');

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'create', path: 'note1.md' })
    );
  });

  it('should emit update event', () => {
    const callback = jest.fn();
    watcher = new Watcher(testDir, callback);

    const watchInstance = (watch as jest.Mock).mock.results[0].value;
    watchInstance.emit?.('change', 'note1.md');

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update', path: 'note1.md' })
    );
  });

  it('should emit delete event', () => {
    const callback = jest.fn();
    watcher = new Watcher(testDir, callback);

    const watchInstance = (watch as jest.Mock).mock.results[0].value;
    watchInstance.emit?.('unlink', 'note1.md');

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'delete', path: 'note1.md' })
    );
  });

  it('should stop watching', () => {
    const callback = jest.fn();
    watcher = new Watcher(testDir, callback);

    watcher.stop();

    expect(watchInstance.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/file_watcher"`
Expected: FAIL with "Cannot find module '../file_watcher'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/sync/file_watcher.ts
import { watch, type FSWatcher } from 'chokidar';
import { basename, extname } from 'path';

export type VaultEventType = 'create' | 'update' | 'delete';
export type VaultEventCallback = (event: VaultEvent) => void;

export interface VaultEvent {
  type: VaultEventType;
  path: string; // Relative path from vault root
}

export class Watcher {
  private watcher: FSWatcher | null = null;
  private callback: VaultEventCallback;

  constructor(vaultPath: string, callback: VaultEventCallback) {
    this.callback = callback;

    this.watcher = watch(vaultPath, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      depth: 99,
      ignored: [
        // Ignore hidden files and directories
        (path: string) => basename(path).startsWith('.'),
        // Ignore non-markdown files
        (path: string) => extname(path) !== '.md' && extname(path) !== '.mdx',
      ],
    });

    this.watcher.on('add', (filePath: string) => {
      this.callback({ type: 'create', path: this.getRelativePath(filePath, vaultPath) });
    });

    this.watcher.on('change', (filePath: string) => {
      this.callback({ type: 'update', path: this.getRelativePath(filePath, vaultPath) });
    });

    this.watcher.on('unlink', (filePath: string) => {
      this.callback({ type: 'delete', path: this.getRelativePath(filePath, vaultPath) });
    });
  }

  private getRelativePath(filePath: string, vaultPath: string): string {
    // Remove vaultPath prefix to get relative path
    if (filePath.startsWith(vaultPath + '/')) {
      return filePath.slice(vaultPath.length + 1);
    }
    return filePath;
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/file_watcher"`
Expected: PASS (may need jest config adjustment for chokidar)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/file_watcher.ts
git commit -m "feat(core): add FileWatcher using chokidar"
```

---

## Chunk 6: Sync Service Integration

### Task 8: Create sync service that wires everything together

**Files:**
- Create: `packages/core/src/sync/service.ts`
- Modify: `packages/core/src/sync/index.ts`
- Modify: `packages/core/package.json` (add better-sqlite3 dependency)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/sync/__tests__/service.test.ts
import { SyncService } from '../service';
import type { SyncServiceConfig } from '../service';
import type { Database } from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';

describe('SyncService', () => {
  let db: Database.Database;
  let syncService: SyncService;

  const config: SyncServiceConfig = {
    vaultPath: '/tmp/aimo-test-vault',
    deviceId: 'test-device-001',
    deviceName: 'Test Device',
  };

  beforeEach(async () => {
    db = new (await import('better-sqlite3')).default(':memory:');
    initDatabase(db);
    setDatabase(db);
    syncService = new SyncService(config, db);
  });

  afterEach(async () => {
    await syncService.stop();
    db.close();
  });

  it('should initialize and register device', async () => {
    await syncService.start();

    const device = syncService.getDevice();
    expect(device.id).toBe('test-device-001');
    expect(device.name).toBe('Test Device');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/service"`
Expected: FAIL with "Cannot find module '../service'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/sync/service.ts
import type { Database } from 'better-sqlite3';
import type { SyncDevice, SyncChangeLogEntry, SyncFileVersion } from '@aimo-note/dto';
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

  constructor(
    config: SyncServiceConfig,
    db: Database.Database
  ) {
    // Initialize schema
    initDatabase(db);

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

    // File watcher will be started when needed
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
  }

  getDevice(): SyncDevice | null {
    return this.deviceManager.getDevice(this.deviceManager['deviceId']);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/service"`
Expected: PASS

- [ ] **Step 5: Add dependency to package.json**

```json
// packages/core/package.json - add to dependencies
{
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  }
}
```

- [ ] **Step 6: Run build to verify**

Run: `pnpm --filter @aimo-note/core build`
Expected: SUCCESS

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/sync/service.ts packages/core/package.json
git commit -m "feat(core): add SyncService to wire together all sync components"
```

---

## Summary

After completing Phase 1, you will have:

1. **SQLite database** with full schema for sync metadata
2. **Device registration** for multi-device support
3. **Change logger** for tracking all file mutations
4. **Version manager** for storing and retrieving file versions
5. **File watcher** for real-time detection of vault changes
6. **Sync service** that integrates all components

### Files Created

```
packages/core/src/sync/
├── index.ts              # Public exports
├── db.ts                # SQLite connection + init
├── schema.sql           # SQL schema definitions
├── types.ts             # Sync-specific types
├── device.ts            # Device registration
├── change_logger.ts     # Change log writer
├── version_manager.ts   # Version CRUD
├── file_watcher.ts      # Chokidar wrapper
└── service.ts           # Integration service

packages/dto/src/
└── sync.ts             # Shared sync types
```

### Next Steps

- **Phase 2**: S3 Adapter + basic sync protocol
- **Phase 3**: Conflict handling + version rollback
- **Phase 4**: GC cleanup + cost optimization
