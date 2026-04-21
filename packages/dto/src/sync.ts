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

export interface GcConfig {
  /** Maximum number of versions to keep per file (default: 10) */
  maxVersionsPerFile?: number;
  /** Delete versions older than this many days (default: 30) */
  maxVersionAgeDays?: number;
  /** Also clean up S3 remote versions (default: false) */
  cleanRemote?: boolean;
}

export interface GcResult {
  /** File paths that had versions cleaned */
  filesCleaned: string[];
  /** Total number of versions removed */
  versionsRemoved: number;
  /** Total bytes reclaimed from deleted files */
  bytesReclaimed: number;
  /** Errors encountered during GC */
  errors: string[];
}

export interface ManifestCompactionResult {
  /** Number of entries removed from the manifest */
  entriesRemoved: number;
  /** Size of manifest JSON before compaction */
  sizeBefore: number;
  /** Size of manifest JSON after compaction */
  sizeAfter: number;
}
