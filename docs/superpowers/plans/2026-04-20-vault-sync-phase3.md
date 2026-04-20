# Vault Sync Phase 3: Conflict Handling + Version Rollback

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement conflict recording + resolution and version rollback so SyncEngine can persist conflicts to SQLite, create conflict rename files on disk, and restore any historical version of a file.

**Architecture:** ConflictManager persists detected conflicts to the `sync_conflicts` table and creates a renamed conflict copy on disk. VersionRollback reads any historical version from local storage or S3 and writes it back to the vault. Both integrate into SyncService, which surfaces conflicts via `getConflicts()` and triggers rollback via `rollback()`.

**Tech Stack:** Same as Phase 1/2 — `packages/core/src/sync/`, `packages/dto/src/sync.ts`.

---

## File Structure

```
packages/core/src/sync/
├── conflicts.ts            ← NEW: ConflictManager — record/resolve conflicts in SQLite
├── rollback.ts             ← NEW: VersionRollback — restore file to any version
├── engine.ts               ← MODIFIED: wire ConflictManager into sync cycle
├── service.ts              ← MODIFIED: add rollback(), getConflicts(), resolveConflict()
└── __tests__/
    ├── conflicts.test.ts   ← NEW
    └── rollback.test.ts   ← NEW

packages/dto/src/sync.ts   ← MODIFIED: add SyncConflictRecord, RollbackResult types
```

---

## Chunk 1: ConflictManager

### Task 14: Add conflict types to dto

**Files:**
- Modify: `packages/dto/src/sync.ts`

- [ ] **Step 1: Add Phase 3 types**

```typescript
// packages/dto/src/sync.ts — add after existing types

export interface SyncConflictRecord {
  id: number;
  filePath: string;
  localVersion: string;
  remoteVersion: string;
  localHash: string;
  remoteHash: string;
  createdAt: string;
  resolved: boolean;
  resolutionPath: string | null;
}

export interface RollbackResult {
  filePath: string;
  restoredVersion: string;
  newVersion: string;
  content: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dto/src/sync.ts
git commit -m "feat(dto): add SyncConflictRecord and RollbackResult types for Phase 3"
```

---

### Task 15: Create ConflictManager module

**Files:**
- Create: `packages/core/src/sync/conflicts.ts`
- Test: `packages/core/src/sync/__tests__/conflicts.test.ts`

**Responsibility:** Record detected conflicts to `sync_conflicts` table, expose unresolved conflicts, mark conflicts resolved, generate conflict filenames.

Conflict filenames follow: `{basename}_conflict_{YYYYMMDD}_{HHMMSS}_{random4}.md`
Example: `note1_conflict_20260420_143052_a1b2.md`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/sync/__tests__/conflicts.test.ts
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

      // Mark one as resolved
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/conflicts"`
Expected: FAIL with "Cannot find module '../conflicts'"

- [ ] **Step 3: Write ConflictManager implementation**

```typescript
// packages/core/src/sync/conflicts.ts
import type { Database } from 'better-sqlite3';
import type { SyncConflictRecord } from '@aimo-note/dto';

function mapRow(row: any): SyncConflictRecord {
  return {
    id: row.id,
    filePath: row.file_path,
    localVersion: row.local_version,
    remoteVersion: row.remote_version,
    localHash: row.local_hash,
    remoteHash: row.remote_hash,
    createdAt: row.created_at,
    resolved: row.resolved === 1,
    resolutionPath: row.resolution_path,
  };
}

export interface RecordConflictInput {
  filePath: string;
  localVersion: string;
  remoteVersion: string;
  localHash: string;
  remoteHash: string;
}

export class ConflictManager {
  constructor(private db: Database.Database) {}

  record(input: RecordConflictInput): SyncConflictRecord {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO sync_conflicts
        (file_path, local_version, remote_version, local_hash, remote_hash, created_at, resolved, resolution_path)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL)
    `);
    const result = stmt.run(
      input.filePath,
      input.localVersion,
      input.remoteVersion,
      input.localHash,
      input.remoteHash,
      now
    );

    return {
      id: result.lastInsertRowid as number,
      ...input,
      createdAt: now,
      resolved: false,
      resolutionPath: null,
    };
  }

  getUnresolved(): SyncConflictRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_conflicts WHERE resolved = 0 ORDER BY created_at DESC')
      .all() as any[];
    return rows.map(mapRow);
  }

  getUnresolvedForFile(filePath: string): SyncConflictRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sync_conflicts WHERE file_path = ? AND resolved = 0 ORDER BY created_at DESC')
      .all(filePath) as any[];
    return rows.map(mapRow);
  }

  getById(id: number): SyncConflictRecord | null {
    const row = this.db
      .prepare('SELECT * FROM sync_conflicts WHERE id = ?')
      .get(id) as any;
    return row ? mapRow(row) : null;
  }

  resolve(id: number, resolutionPath: string): void {
    this.db
      .prepare('UPDATE sync_conflicts SET resolved = 1, resolution_path = ? WHERE id = ?')
      .run(resolutionPath, id);
  }

  generateConflictFilename(originalPath: string): string {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 8);   // YYYYMMDD
    const timeStr = now.toISOString().replace(/[-:T]/g, '').slice(9, 15);  // HHMMSS
    const rand = Math.random().toString(36).slice(2, 6);                    // 4 random chars

    const basename = originalPath.replace(/\.mdx?$/, '');
    const ext = originalPath.endsWith('.mdx') ? '.mdx' : '.md';

    return `${basename}_conflict_${dateStr}_${timeStr}_${rand}${ext}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/conflicts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/conflicts.ts packages/core/src/sync/__tests__/conflicts.test.ts
git commit -m "feat(core): add ConflictManager for conflict tracking and resolution"
```

---

## Chunk 2: VersionRollback

### Task 16: Create VersionRollback module

**Files:**
- Create: `packages/core/src/sync/rollback.ts`
- Test: `packages/core/src/sync/__tests__/rollback.test.ts`

**Responsibility:** Given a `filePath` and `targetVersion`, restore the file content and write it back to the vault. Creates a new version entry (non-destructive — old versions are never overwritten). Falls back to S3 download if the version content is not locally available.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/sync/__tests__/rollback.test.ts
import { Database } from 'better-sqlite3';
import { initDatabase, setDatabase } from '../db';
import { VersionRollback } from '../rollback';
import { VersionManager } from '../version_manager';
import type { S3Adapter } from '../adapter';

const mockAdapter = {
  getObject: jest.fn(),
} as any as S3Adapter;

describe('VersionRollback', () => {
  let db: Database.Database;
  let versionManager: VersionManager;
  let rollback: VersionRollback;
  const vaultPath = '/tmp/aimo-test-vault';

  beforeEach(() => {
    db = new (require('better-sqlite3'))(':memory:');
    initDatabase(db);
    setDatabase(db);
    versionManager = new VersionManager(db, 'device-001', `${vaultPath}/.aimo/versions`);
    rollback = new VersionRollback(versionManager, mockAdapter, vaultPath);
  });

  afterEach(() => {
    db.close();
  });

  describe('rollback', () => {
    it('should restore a local version to the vault', () => {
      // Create two versions
      versionManager.createVersion('note1.md', 'v1', 'sha256:v1hash', 'content version 1');
      versionManager.createVersion('note1.md', 'v2', 'sha256:v2hash', 'content version 2');

      const result = rollback.rollback('note1.md', 'v1');

      expect(result.restoredVersion).toBe('v1');
      expect(result.newVersion).toMatch(/^v\d+$/); // new version label
      expect(result.content).toBe('content version 1');
    });

    it('should fetch version from S3 when not available locally', async () => {
      // Only v2 is local
      versionManager.createVersion('note1.md', 'v2', 'sha256:v2hash', 'content version 2');
      // v1 is not local — mock S3
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

      // Two rollback versions should exist
      const history = versionManager.getFileHistory('note1.md');
      // v1, rollback-1, rollback-2, v2 (ordered by created_at DESC)
      const versions = history.map(v => v.version);
      expect(versions).toContain('v1');
      expect(versions).toContain('v2');
    });
  });
});
```

> **Note on vault file write:** `VersionRollback.rollback()` writes the restored content to the vault path. In the test, `vaultPath = '/tmp/aimo-test-vault'`, so the file lands at `/tmp/aimo-test-vault/note1.md`. In the test environment this is fine. In production, the vault path is set via `SyncServiceConfig.vaultPath`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/rollback"`
Expected: FAIL with "Cannot find module '../rollback'"

- [ ] **Step 3: Write VersionRollback implementation**

```typescript
// packages/core/src/sync/rollback.ts
import type { VersionManager } from './version_manager';
import type { S3Adapter } from './adapter';
import type { RollbackResult } from '@aimo-note/dto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';

export class VersionRollback {
  constructor(
    private versionManager: VersionManager,
    private adapter: S3Adapter | null,
    private vaultPath: string
  ) {}

  /**
   * Restore a file to a specific historical version.
   * Creates a new version entry (non-destructive).
   * Falls back to S3 download if the version is not available locally.
   */
  async rollback(filePath: string, targetVersion: string): Promise<RollbackResult> {
    // Step 1: Try to get content from local version store
    let content = this.versionManager.getVersionContent(filePath, targetVersion);

    // Step 2: If not locally available, try to download from S3
    if (content === null && this.adapter) {
      const contentKey = `.aimo/versions/${filePath}/${targetVersion}.content`;
      const remoteContent = await this.adapter.getObject(contentKey);
      if (remoteContent !== null) {
        content = remoteContent;
      }
    }

    // Step 3: If still no content, fail
    if (content === null) {
      throw new Error(`Version ${targetVersion} not found for ${filePath}`);
    }

    // Step 4: Write restored content to the vault file
    const vaultFilePath = join(this.vaultPath, filePath);
    const dir = dirname(vaultFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(vaultFilePath, content, 'utf-8');

    // Step 5: Create a new version entry to record the restoration
    const newVersionLabel = this.incrementVersion(targetVersion);
    const hash = VersionManager.computeHash(content);
    const message = `restored from ${targetVersion}`;

    this.versionManager.createVersion(filePath, newVersionLabel, hash, content, message);

    return {
      filePath,
      restoredVersion: targetVersion,
      newVersion: newVersionLabel,
      content,
    };
  }

  /**
   * Increment a version string.
   * Handles v1 → v2, v10 → v11, etc.
   * Also handles bare numbers: 1 → 2, 10 → 11.
   */
  private incrementVersion(version: string): string {
    const match = version.match(/^v?(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10) + 1;
      return `v${num}`;
    }
    // Fallback: append .1
    return `${version}.1`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/rollback"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sync/rollback.ts packages/core/src/sync/__tests__/rollback.test.ts
git commit -m "feat(core): add VersionRollback for non-destructive version restoration"
```

---

## Chunk 3: Wire ConflictManager into SyncEngine

### Task 17: Modify SyncEngine to record conflicts and create conflict rename files

**Files:**
- Modify: `packages/core/src/sync/engine.ts`

The SyncEngine currently detects conflicts in `diff()` but does not record them to the database or create conflict rename files. After this task, when a conflict is detected:
1. Call `conflictManager.record()` to persist to `sync_conflicts` table
2. Call `conflictManager.generateConflictFilename()` to get the conflict filename
3. Write the remote version content to the conflict filename in the vault
4. Keep the local version at the original filename

- [ ] **Step 1: Read the current engine.ts**

The current implementation is already shown above. Review it before editing.

- [ ] **Step 2: Update SyncEngine to accept ConflictManager**

```typescript
// packages/core/src/sync/engine.ts — add ConflictManager import and constructor param

import type { ConflictManager } from './conflicts';

// In the constructor, add:
export class SyncEngine {
  private manifestManager: ManifestManager;

  constructor(
    private adapter: S3Adapter,
    private versionManager: VersionManager,
    private changeLogger: ChangeLogger,
    private deviceId: string,
    private conflictManager?: ConflictManager  // NEW: optional to avoid breaking existing callers
  ) {
    this.manifestManager = new ManifestManager(adapter, deviceId);
  }
```

- [ ] **Step 3: Add conflict file creation helper method**

Add this method inside `SyncEngine`:

```typescript
  /**
   * On conflict: save the remote version to a conflict-rename file on disk,
   * and record the conflict in the SQLite conflicts table.
   * The local version stays at the original path (current device wins locally).
   */
  private async createConflictFile(filePath: string, remoteVersion: string): Promise<string> {
    if (!this.conflictManager) {
      return filePath; // No-op if ConflictManager not wired
    }

    const contentKey = `.aimo/versions/${filePath}/${remoteVersion}.content`;
    const content = await this.adapter.getObject(contentKey);
    if (!content) return filePath;

    const conflictFilename = this.conflictManager.generateConflictFilename(filePath);
    const conflictPath = join(this.vaultPath ?? '', conflictFilename);

    // Write remote version to conflict file
    const dir = dirname(conflictPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(conflictPath, content, 'utf-8');

    // Record in SQLite
    const localEntry = this.versionManager.getLatestVersion(filePath);
    this.conflictManager.record({
      filePath,
      localVersion: localEntry?.version ?? '',
      remoteVersion,
      localHash: localEntry?.hash ?? '',
      remoteHash: '', // hash will be filled by the caller with remote hash
    });

    return conflictFilename;
  }
```

> **Note:** `vaultPath` is not currently stored in `SyncEngine`. You need to add it. Add a private field `private vaultPath: string` and pass it from `SyncService` when constructing `SyncEngine`.

- [ ] **Step 4: Update the sync() method to call createConflictFile**

In the `sync()` method, after detecting conflicts:

```typescript
    // Step 3: Diff
    const { toUpload, toDownload, conflicts } = this.manifestManager.diff(localManifest, remoteManifest);
    result.conflicts.push(...conflicts);

    // Step 3b: Handle conflicts — record and create conflict files
    for (const filePath of conflicts) {
      const remoteEntry = remoteManifest.files[filePath];
      if (!remoteEntry) continue;

      // Store remote hash on the conflict manager record
      // First record the conflict (local hash from versionManager)
      const localEntry = this.versionManager.getLatestVersion(filePath);
      if (this.conflictManager) {
        const record = this.conflictManager.record({
          filePath,
          localVersion: localEntry?.version ?? '',
          remoteVersion: remoteEntry.version,
          localHash: localEntry?.hash ?? '',
          remoteHash: remoteEntry.hash,
        });

        // Write the remote version to a conflict rename file
        const conflictFilename = await this.createConflictFile(filePath, remoteEntry.version);
        // Overwrite the record with the conflict filename
        this.conflictManager.resolve(record.id, conflictFilename);
      }

      // Upload the local version to S3 (so both versions exist remotely)
      await this.uploadVersion(filePath);
      result.uploaded.push(filePath);
    }
```

> **Important:** The Phase 2 engine already skips uploading conflicting files (`if (conflicts.includes(filePath)) continue;`). You need to **remove** that skip and instead handle conflicts as described above — upload the local version to S3 (so both versions are stored remotely) but create a conflict file locally.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/engine"`
Expected: PASS (existing tests may need minor updates to pass a `conflictManager` mock)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/sync/engine.ts
git commit -m "feat(core): wire ConflictManager into SyncEngine for conflict recording and files"
```

---

## Chunk 4: SyncService Integration

### Task 18: Add Phase 3 methods to SyncService

**Files:**
- Modify: `packages/core/src/sync/service.ts`
- Modify: `packages/core/src/sync/index.ts`

Add the following methods to `SyncService`:

```typescript
// packages/core/src/sync/service.ts

import { ConflictManager } from './conflicts';
import { VersionRollback } from './rollback';

// In the class, add fields:
private conflictManager: ConflictManager;
private rollback: VersionRollback;

// In the constructor, after Phase 2 initialization:
this.conflictManager = new ConflictManager(db);
this.rollback = new VersionRollback(
  this.versionManager,
  this.adapter,  // S3Adapter (null if sync not configured — rollback from S3 will no-op)
  config.vaultPath
);

// Add these methods:

/**
 * Get all unresolved conflicts.
 */
getConflicts(): SyncConflictRecord[] {
  return this.conflictManager.getUnresolved();
}

/**
 * Get unresolved conflicts for a specific file.
 */
getConflictsForFile(filePath: string): SyncConflictRecord[] {
  return this.conflictManager.getUnresolvedForFile(filePath);
}

/**
 * Mark a conflict as resolved.
 */
resolveConflict(conflictId: number, resolutionPath: string): void {
  this.conflictManager.resolve(conflictId, resolutionPath);
}

/**
 * Rollback a file to a specific version.
 * Non-destructive: creates a new version entry.
 */
async rollback(filePath: string, targetVersion: string): Promise<RollbackResult> {
  if (!this.rollback) {
    throw new Error('Rollback not initialized');
  }
  return this.rollback.rollback(filePath, targetVersion);
}
```

Update the index.ts to export the new modules:

```typescript
// packages/core/src/sync/index.ts — add exports
export * from './conflicts.js';
export * from './rollback.js';
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/sync/service.ts packages/core/src/sync/index.ts
git commit -m "feat(core): add getConflicts, resolveConflict, rollback to SyncService"
```

---

## Chunk 5: Conflict Download Handling

### Task 19: Downloaded conflicts should also be recorded

When a file is downloaded that already exists locally with a different hash (conflict), the `SyncEngine.downloadVersion()` path also needs to handle conflict recording.

In the `sync()` method, when processing `toDownload`, check if the local file has diverged:

```typescript
    // Step 5: Download remote versions
    for (const filePath of toDownload) {
      try {
        // Check if we already have a local version with a different hash (silent conflict)
        const localLatest = this.versionManager.getLatestVersion(filePath);
        const remoteEntry = remoteManifest.files[filePath];
        const version = remoteEntry?.version ?? 'v1';

        if (localLatest && localLatest.hash !== remoteEntry?.hash) {
          // Silent conflict: remote changed while we had local changes
          // Record it but keep the downloaded (remote) version as the authoritative one
          if (this.conflictManager) {
            const conflictFilename = this.conflictManager.generateConflictFilename(filePath);
            // Save local version to conflict file before overwriting
            const localContent = this.versionManager.getVersionContent(filePath, localLatest.version);
            if (localContent !== null) {
              const conflictPath = join(this.vaultPath ?? '', conflictFilename);
              const dir = dirname(conflictPath);
              if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
              writeFileSync(conflictPath, localContent, 'utf-8');
            }
            this.conflictManager.record({
              filePath,
              localVersion: localLatest.version,
              remoteVersion: version,
              localHash: localLatest.hash,
              remoteHash: remoteEntry?.hash ?? '',
            });
            this.conflictManager.resolve(
              this.conflictManager.getUnresolvedForFile(filePath).at(-1)?.id ?? 0,
              conflictFilename
            );
          }
        }

        await this.downloadVersion(filePath, version);
        result.downloaded.push(filePath);
      } catch (err) {
        result.errors.push(`download ${filePath}: ${err}`);
      }
    }
```

> **Note:** `vaultPath` needs to be accessible in `SyncEngine`. Store it as a private field `private vaultPath: string` passed to the constructor.

- [ ] **Step 1: Update SyncEngine constructor to accept vaultPath**

```typescript
// packages/core/src/sync/engine.ts constructor
constructor(
  private adapter: S3Adapter,
  private versionManager: VersionManager,
  private changeLogger: ChangeLogger,
  private deviceId: string,
  private conflictManager?: ConflictManager,
  private vaultPath?: string  // NEW
) {
  this.manifestManager = new ManifestManager(adapter, deviceId);
}
```

- [ ] **Step 2: Add missing imports to engine.ts**

```typescript
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
```

- [ ] **Step 3: Run tests and fix any failures**

Run: `pnpm --filter @aimo-note/core test -- --testPathPattern="sync/__tests__/engine"`
Expected: PASS

- [ ] **Step 4: Update SyncService to pass vaultPath to SyncEngine**

```typescript
// packages/core/src/sync/service.ts — when constructing SyncEngine:
this.syncEngine = new SyncEngine(
  this.adapter,
  this.versionManager,
  this.changeLogger,
  config.deviceId,
  this.conflictManager,  // NEW
  config.vaultPath        // NEW
);
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @aimo-note/core test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/sync/engine.ts packages/core/src/sync/service.ts
git commit -m "feat(core): handle silent conflicts on download and propagate vaultPath to SyncEngine"
```

---

## Summary

After completing Phase 3, you will have:

1. **ConflictManager** — persists conflicts to `sync_conflicts` table, generates conflict filenames, exposes unresolved conflicts
2. **VersionRollback** — restores any historical version (local or from S3), non-destructive, creates new version entry
3. **SyncEngine conflict wiring** — records conflicts to SQLite, creates `*_conflict_*.md` rename files on disk, uploads both versions to S3
4. **SyncService Phase 3 API** — `getConflicts()`, `getConflictsForFile()`, `resolveConflict()`, `rollback(filePath, targetVersion)`

### Files Created/Modified

```
packages/core/src/sync/
├── conflicts.ts              # NEW — ConflictManager
├── rollback.ts              # NEW — VersionRollback
├── engine.ts                # MODIFIED — conflict recording + vaultPath
├── service.ts               # MODIFIED — Phase 3 methods
├── index.ts                 # MODIFIED — export new modules
└── __tests__/
    ├── conflicts.test.ts     # NEW
    └── rollback.test.ts     # NEW

packages/dto/src/sync.ts     # MODIFIED — SyncConflictRecord, RollbackResult
```

### Next Steps

- **Phase 4**: GC cleanup + cost optimization (delete old versions, manifest compaction)
