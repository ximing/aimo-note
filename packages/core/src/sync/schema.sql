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

-- Local change queue
CREATE TABLE IF NOT EXISTS sync_local_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
  blob_hash TEXT,
  base_revision TEXT,
  new_revision TEXT NOT NULL,
  size_bytes INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0,
  device_id TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES sync_devices(id)
);

-- Indexes for change queue
CREATE INDEX IF NOT EXISTS idx_local_changes_synced ON sync_local_changes(synced);
CREATE INDEX IF NOT EXISTS idx_local_changes_file_path ON sync_local_changes(file_path);
CREATE INDEX IF NOT EXISTS idx_local_changes_created ON sync_local_changes(created_at);

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
