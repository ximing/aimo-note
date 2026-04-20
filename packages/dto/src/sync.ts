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
  id?: number | bigint;
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

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;       // For S3-compatible storages (Cloudflare R2, MinIO, self-hosted)
  forcePathStyle?: boolean; // Required for some S3-compatible backends
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface SyncManifestFileEntry {
  hash: string;
  version: string;
  updatedAt: string;
  isDeleted?: boolean;
}

export interface SyncManifest {
  version: string; // Manifest format version
  updatedAt: string;
  deviceId: string;
  files: Record<string, SyncManifestFileEntry>;
}

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
