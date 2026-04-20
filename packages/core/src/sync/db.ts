import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  created_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

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

CREATE INDEX IF NOT EXISTS idx_change_log_synced ON sync_change_log(synced);
CREATE INDEX IF NOT EXISTS idx_change_log_created ON sync_change_log(created_at);
CREATE INDEX IF NOT EXISTS idx_file_versions_path ON sync_file_versions(file_path);
`;

let db: Database.Database | null = null;

export function initDatabase(database: Database.Database): void {
  const statements = SCHEMA.split(';')
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
  if (db) {
    db.close();
  }
  db = database;
}
