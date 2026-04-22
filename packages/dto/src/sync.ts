// Core types for aimo-note
export interface Note {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface VaultStats {
  noteCount: number;
  lastModified: Date;
}

// =============================================================================
// Existing Sync Types (used by core/client)
// =============================================================================

export interface SyncDevice {
  id: string;
  name: string;
  lastSeen: string;
  createdAt: string;
}

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

// =============================================================================
// Auth DTOs
// =============================================================================

export interface RegisterDto {
  email: string;
  username: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface LoginResponseDto {
  token: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
}

// =============================================================================
// Vault DTOs
// =============================================================================

export interface CreateVaultDto {
  name: string;
  description?: string;
}

// =============================================================================
// Device DTOs
// =============================================================================

export interface RegisterDeviceRequest {
  vaultId: string;
  deviceId: string;
  name: string;
  platform?: string;
  clientVersion?: string;
}

export interface RegisterDeviceResponse {
  deviceId: string;
  vaultId: string;
  registered: boolean;
  lastSeenAt: string;
}

// =============================================================================
// Blob DTOs
// =============================================================================

export interface HasBlobsRequest {
  vaultId: string;
  blobHashes: string[];
}

export interface HasBlobsResponse {
  results: Array<{ blobHash: string; exists: boolean }>;
}

export interface CreateBlobUploadUrlRequest {
  vaultId: string;
  blobHash: string;
  sizeBytes: number;
  mimeType: string;
}

export interface CreateBlobUploadUrlResponse {
  blobHash: string;
  storageKey: string;
  uploadUrl: string;
  headers?: Record<string, string>;
  expiresIn: number;
}

export interface CreateBlobDownloadUrlRequest {
  vaultId: string;
  blobHash: string;
}

export interface CreateBlobDownloadUrlResponse {
  blobHash: string;
  storageKey: string;
  downloadUrl: string;
  expiresIn: number;
}

export interface BlobRef {
  blobHash: string;
  sizeBytes: number;
  mimeType: string | null;
}

// =============================================================================
// Sync Operation DTOs
// =============================================================================

export type SyncOperation = 'upsert' | 'delete';

export interface SyncChangeInput {
  filePath: string;
  op: SyncOperation;
  blobHash: string | null;
  baseRevision: string | null;
  newRevision: string;
  sizeBytes: number | null;
  metadataJson: string | null;
}

export interface CommitRequest {
  vaultId: string;
  deviceId: string;
  requestId: string;
  baseSeq: number | null;
  summary?: string;
  changes: SyncChangeInput[];
}

export interface AppliedChange {
  filePath: string;
  headRevision: string;
  blobHash: string | null;
  isDeleted: boolean;
}

export interface CommitResponse {
  accepted: boolean;
  commitId?: string;
  commitSeq: number;
  appliedChanges: AppliedChange[];
  reason?: string;
  conflicts?: ServerConflict[];
}

export interface PullResponse {
  vaultId: string;
  sinceSeq: number;
  latestSeq: number;
  hasMore: boolean;
  blobRefs: BlobRef[];
  commits: Array<{
    commitSeq: number;
    commitId: string;
    deviceId: string;
    userId: string;
    baseSeq: number | null;
    changeCount: number;
    createdAt: string;
    changes: Array<{
      filePath: string;
      op: SyncOperation;
      blobHash: string | null;
      newRevision: string;
      sizeBytes: number | null;
      isDeleted: boolean;
    }>;
  }>;
}

export interface AckRequest {
  vaultId: string;
  deviceId: string;
  ackedSeq: number;
}

export interface AckResponse {
  deviceId: string;
  vaultId: string;
  lastPulledSeq: number;
  updated: boolean;
}

// =============================================================================
// Sync Status & Trigger
// =============================================================================

export type SyncStatus =
  | 'DISABLED'
  | 'IDLE'
  | 'PENDING'
  | 'SYNCING'
  | 'OFFLINE'
  | 'ERROR';

export type SyncTrigger =
  | 'startup'
  | 'login'
  | 'network_recovery'
  | 'pending_change'
  | 'periodic_poll'
  | 'manual';

// =============================================================================
// Conflict DTOs
// =============================================================================

export interface ServerConflict {
  filePath: string;
  expectedBaseRevision: string;
  actualHeadRevision: string;
  remoteBlobHash: string;
  winningCommitSeq: number;
}

// =============================================================================
// History DTOs
// =============================================================================

export interface SyncHistoryEntry {
  revision: string;
  blobHash: string | null;
  commitSeq: number;
  createdAt: string;
  deviceId: string;
  isDeleted: boolean;
}

export interface HistoryBlobResponse {
  revision: string;
  blobHash: string;
  sizeBytes: number;
  mimeType: string | null;
  isDeleted: boolean;
}

// =============================================================================
// Snapshot DTOs
// =============================================================================

export interface SnapshotRecord {
  id: string;
  vaultId: string;
  status: string;
  baseSeq: number;
  sizeBytes: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface SnapshotRestoreResult {
  snapshotId: string;
  restoredCommitSeq: number;
  restoredFiles: number;
}

// =============================================================================
// Runtime Metadata Field Names (Frozen)
// These field names are reserved for sync runtime metadata and should not be
// used for other purposes in the sync domain.
// =============================================================================

/**
 * Frozen runtime metadata field names used by the sync engine.
 * These fields are reserved and should not be reused for other purposes.
 */
export const SYNC_RUNTIME_METADATA_FIELDS = [
  'trigger',
  'retryCount',
  'offlineStartedAt',
  'recoveredAt',
  'nextRetryAt',
  'requestId',
  'deviceId',
] as const;

export type SyncRuntimeMetadataField =
  (typeof SYNC_RUNTIME_METADATA_FIELDS)[number];
