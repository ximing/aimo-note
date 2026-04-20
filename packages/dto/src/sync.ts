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