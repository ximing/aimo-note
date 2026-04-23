/**
 * Snapshot module - Client-side snapshot operations
 *
 * Provides snapshot listing, creation triggering, restore triggering,
 * and restore status polling functionality.
 */

import type {
  SnapshotRecord,
  SnapshotRestoreResult,
  SnapshotTaskStatus,
} from '@aimo-note/dto';

// =============================================================================
// Types
// =============================================================================

/**
 * Snapshot list options
 */
export interface SnapshotListOptions {
  page?: number;
  pageSize?: number;
}

/**
 * Snapshot create options
 */
export interface SnapshotCreateOptions {
  vaultId: string;
  description?: string;
}

/**
 * Snapshot restore options
 */
export interface SnapshotRestoreOptions {
  snapshotId: string;
  vaultId: string;
  deviceId?: string;
}

/**
 * Snapshot list response
 */
export interface SnapshotListResponse {
  items: SnapshotRecord[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

// =============================================================================
// Snapshot Operations
// =============================================================================

/**
 * Snapshot listing - calls server API to list snapshots for a vault
 */
export async function listSnapshots(
  serverAdapter: {
    baseUrl: string;
    deviceId: string;
    getToken: () => string | null;
  },
  vaultId: string,
  options: SnapshotListOptions = {}
): Promise<SnapshotListResponse> {
  const { page = 1, pageSize = 20 } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': serverAdapter.deviceId,
  };

  const token = serverAdapter.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const params = new URLSearchParams({
    vaultId,
    page: String(page),
    pageSize: String(pageSize),
  });

  const response = await fetch(
    `${serverAdapter.baseUrl}/api/v1/snapshots?${params}`,
    { method: 'GET', headers }
  );

  if (!response.ok) {
    throw new Error(`Failed to list snapshots: HTTP ${response.status}`);
  }

  const data = await response.json() as {
    data?: SnapshotListResponse;
  };

  return data.data ?? { items: [], page: 1, pageSize: 20, total: 0, hasMore: false };
}

/**
 * Snapshot create trigger - creates a new snapshot on the server
 */
export async function createSnapshot(
  serverAdapter: {
    baseUrl: string;
    deviceId: string;
    getToken: () => string | null;
  },
  options: SnapshotCreateOptions
): Promise<SnapshotRecord> {
  const { vaultId, description } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': serverAdapter.deviceId,
  };

  const token = serverAdapter.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${serverAdapter.baseUrl}/api/v1/snapshots`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ vaultId, description }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create snapshot: HTTP ${response.status}`);
  }

  const data = await response.json() as {
    data?: SnapshotRecord;
  };

  if (!data.data) {
    throw new Error('No snapshot data returned');
  }

  return data.data;
}

/**
 * Snapshot get status - get snapshot by ID (for polling)
 */
export async function getSnapshot(
  serverAdapter: {
    baseUrl: string;
    deviceId: string;
    getToken: () => string | null;
  },
  snapshotId: string
): Promise<SnapshotRecord> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': serverAdapter.deviceId,
  };

  const token = serverAdapter.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(
    `${serverAdapter.baseUrl}/api/v1/snapshots/${encodeURIComponent(snapshotId)}`,
    { method: 'GET', headers }
  );

  if (!response.ok) {
    throw new Error(`Failed to get snapshot: HTTP ${response.status}`);
  }

  const data = await response.json() as {
    data?: SnapshotRecord;
  };

  if (!data.data) {
    throw new Error('No snapshot data returned');
  }

  return data.data;
}

/**
 * Snapshot restore trigger - triggers restore operation on the server
 */
export async function restoreSnapshot(
  serverAdapter: {
    baseUrl: string;
    deviceId: string;
    getToken: () => string | null;
  },
  options: SnapshotRestoreOptions
): Promise<SnapshotRestoreResult> {
  const { snapshotId, vaultId, deviceId } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': serverAdapter.deviceId,
  };

  const token = serverAdapter.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(
    `${serverAdapter.baseUrl}/api/v1/snapshots/${encodeURIComponent(snapshotId)}/restore`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ vaultId, deviceId }),
    }
  );

  if (!response.ok) {
    // Check for 409 Conflict (restore already in progress)
    if (response.status === 409) {
      const errorData = await response.json() as {
        error?: {
          message?: string;
          existingTask?: SnapshotRestoreResult;
        };
      };
      const error = new Error('Restore already in progress') as Error & { existingTask?: SnapshotRestoreResult };
      error.existingTask = errorData.error?.existingTask;
      throw error;
    }
    throw new Error(`Failed to restore snapshot: HTTP ${response.status}`);
  }

  const data = await response.json() as {
    data?: SnapshotRestoreResult;
  };

  if (!data.data) {
    throw new Error('No restore result returned');
  }

  return data.data;
}

/**
 * Poll restore status until completion or failure
 * Returns the final snapshot record with status
 */
export async function pollRestoreStatus(
  serverAdapter: {
    baseUrl: string;
    deviceId: string;
    getToken: () => string | null;
  },
  snapshotId: string,
  options: {
    intervalMs?: number;
    maxAttempts?: number;
    onPoll?: (status: SnapshotTaskStatus, attempt: number) => void;
  } = {}
): Promise<SnapshotRecord> {
  const { intervalMs = 2000, maxAttempts = 30, onPoll } = options;

  let attempts = 0;

  while (attempts < maxAttempts) {
    const snapshot = await getSnapshot(serverAdapter, snapshotId);

    onPoll?.(snapshot.status, attempts + 1);

    if (snapshot.status === 'succeeded' || snapshot.status === 'failed') {
      return snapshot;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
    attempts++;
  }

  throw new Error('Restore polling timed out');
}

/**
 * Check if restore is in a terminal state
 */
export function isRestoreComplete(status: SnapshotTaskStatus): boolean {
  return status === 'succeeded' || status === 'failed';
}
