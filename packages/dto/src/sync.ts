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

/**
 * Alias for SyncFileVersion - represents a historical revision of a file.
 * Phase 1 Plan Task 1 export requirement.
 */
export type SyncRevisionRecord = SyncFileVersion;

/**
 * Represents a local change that is pending sync to the server.
 * Phase 1 Plan Task 1 export requirement.
 */
export interface SyncLocalChange {
  id: number;
  filePath: string;
  operation: SyncOperation;
  blobHash: string | null;
  baseRevision: string | null;
  newRevision: string;
  sizeBytes: number | null;
  metadataJson: string | null;
  createdAt: string;
  synced: boolean;
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
  // Shared fields from ServerConflict canonical contract
  expectedBaseRevision: string;
  actualHeadRevision: string;
  remoteBlobHash: string | null;
  winningCommitSeq: number;
  // Local auxiliary fields
  localHash: string;
  conflictCopyPath?: string;
  createdAt: string;
  resolved: boolean;
  resolutionPath: string | null;
}

export interface RollbackRequest {
  filePath: string;
  targetVersion: string;
  trigger?: SyncTrigger;
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
  existing: string[];
  missing: string[];
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
  | 'network_recovered'
  | 'pending_change'
  | 'periodic'
  | 'manual'
  | 'rollback';

// =============================================================================
// Conflict DTOs
// =============================================================================

/**
 * Canonical transport contract for sync conflicts across client and server.
 * All conflict representations must use these exact field names.
 * Any field rename or semantic extension must update this contract first.
 */
export interface ServerConflict {
  filePath: string;
  expectedBaseRevision: string;
  actualHeadRevision: string;
  remoteBlobHash: string | null;
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

/**
 * Task status for snapshot operations.
 * Only `succeeded` and `failed` are terminal states.
 */
export type SnapshotTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/**
 * Configuration for snapshot creation.
 */
export interface SnapshotConfig {
  /** Human-readable description for this snapshot */
  description?: string;
  /** Retention days - snapshot will be automatically deleted after this many days (default: 30) */
  retentionDays?: number;
  /** Include blob content in snapshot (default: false) */
  includeBlobs?: boolean;
  /** Tags for organizing snapshots */
  tags?: string[];
}

/**
 * Snapshot record with polling and task status fields.
 */
export interface SnapshotRecord {
  id: string;
  vaultId: string;
  status: SnapshotTaskStatus;
  baseSeq: number;
  sizeBytes: number | null;
  createdAt: string;
  finishedAt: string | null;
  /** Commit seq restored from this snapshot (if applicable) */
  restoredCommitSeq: number | null;
  /** Reason for failure if status is 'failed' */
  failureReason: string | null;
  /** Final commit seq after restore completes */
  finalCommitSeq: number | null;
  /** Last update timestamp for polling */
  updatedAt: string;
}

/**
 * Snapshot restore result with task status and failure information.
 */
export interface SnapshotRestoreResult {
  snapshotId: string;
  status: SnapshotTaskStatus;
  restoredCommitSeq: number;
  restoredFiles: number;
  /** Summary of restore results */
  resultSummary: string | null;
  /** Reason for failure if status is 'failed' */
  failureReason: string | null;
  /** Final commit seq after restore completes */
  finalCommitSeq: number | null;
}

// =============================================================================
// Tombstone DTOs
// =============================================================================

/**
 * Tombstone retention configuration.
 */
export interface TombstoneRetentionConfig {
  /** Number of days to retain tombstones before cleanup (default: 30) */
  retentionDays: number;
  /** Protect tombstones newer than this cursor from cleanup */
  deviceCursorProtectedDays?: number;
  /** Automatically clean up tombstones older than retention period */
  autoCleanup?: boolean;
}

/**
 * Result of a tombstone cleanup operation.
 */
export interface TombstoneCleanupResult {
  /** Number of tombstones deleted */
  deletedCount: number;
  /** Errors encountered during cleanup */
  errors: string[];
  /** Timestamp when cleanup was performed */
  cleanedAt: string;
}

// =============================================================================
// Sync Metrics DTOs
// =============================================================================

/**
 * Metrics snapshot for sync observability.
 */
export interface SyncMetricsSnapshot {
  /** Total number of successful commit operations */
  commitSuccessTotal: number;
  /** Total number of failed commit operations */
  commitFailureTotal: number;
  /** Total number of successful pull operations */
  pullSuccessTotal: number;
  /** Total number of failed pull operations */
  pullFailureTotal: number;
  /** Total number of blob upload requests */
  blobUploadRequestTotal: number;
  /** Total number of failed blob upload requests */
  blobUploadFailureTotal: number;
  /** Total number of blob download requests */
  blobDownloadRequestTotal: number;
  /** Total number of failed blob download requests */
  blobDownloadFailureTotal: number;
  /** Total bytes uploaded */
  bytesUploaded: number;
  /** Total bytes downloaded */
  bytesDownloaded: number;
  /** Current sync status */
  currentStatus: SyncStatus;
  /** Timestamp of snapshot */
  capturedAt: string;
}

// =============================================================================
// Sync Diagnostics DTOs
// =============================================================================

/**
 * Sync diagnostics covering trigger, offline state, and retry information.
 */
export interface SyncDiagnostics {
  /** Source that triggered the last sync operation */
  lastTriggerSource: SyncTrigger | null;
  /** Reason for being offline (if currently offline) */
  offlineReason: string | null;
  /** Timestamp of next scheduled retry */
  nextRetryAt: string | null;
  /** Request ID of the last failed request */
  lastFailedRequestId: string | null;
  /** Device ID associated with the last failed request */
  lastFailedRequestDeviceId: string | null;
  /** Timestamp of the last successful sync */
  lastSuccessfulSyncAt: string | null;
  /** Number of consecutive failures */
  consecutiveFailures: number;
}

// =============================================================================
// Sync Runtime Event DTOs
// =============================================================================

/**
 * Runtime event emitted during sync operations.
 * These events are used for offline replay and diagnostics.
 *
 * Idempotency key: combination of `requestId` + `deviceId` + `trigger`
 * Deduplication: events with the same idempotency key within a 24h window are deduplicated
 * Offline replay: events captured while offline are replayed on reconnection
 */
export interface SyncRuntimeEvent {
  /** What triggered this sync event */
  trigger: SyncTrigger;
  /** Number of retry attempts */
  retryCount: number;
  /** Timestamp when offline state started (if applicable) */
  offlineStartedAt: string | null;
  /** Timestamp when connection was recovered (if applicable) */
  recoveredAt: string | null;
  /** Timestamp of next scheduled retry (if applicable) */
  nextRetryAt: string | null;
  /** Unique request ID for this sync operation */
  requestId: string;
  /** Device ID performing the sync */
  deviceId: string;
  /** Event timestamp */
  occurredAt: string;
}

/**
 * Acknowledgment for runtime event reporting.
 */
export interface SyncRuntimeEventAck {
  /** Whether the event was accepted */
  accepted: boolean;
  /** Whether the event was deduplicated */
  deduplicated: boolean;
  /** Timestamp when the event was processed */
  processedAt: string;
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
