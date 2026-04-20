// Re-export sync types from dto for core usage
export type { SyncDevice, SyncChangeLogEntry, SyncFileVersion, SyncConflict, SyncState, SyncOperation } from '@aimo-note/dto';

// Local-only types for core
export interface SyncConfig {
  vaultPath: string;
  deviceId: string;
  deviceName: string;
}
