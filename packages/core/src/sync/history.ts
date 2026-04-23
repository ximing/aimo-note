/**
 * HistoryManager - Client-side history query interface
 *
 * Architecture note:
 * This class is a placeholder. The actual history query implementation
 * lives in apps/client/src/main/ipc/handlers.ts (sync:listHistory IPC handler),
 * which is the correct place for IPC-based operations.
 *
 * packages/core cannot call IPC directly (no Electron/node IPC access).
 * This class exists to document the interface contract for future
 * offline caching layer where HistoryManager would accept a
 * historyProvider dependency that wraps the IPC call.
 */

import type { SyncHistoryEntry } from '@aimo-note/dto';

export interface ListHistoryParams {
  vaultId: string;
  filePath: string;
  page?: number;
  pageSize?: number;
}

export interface ListHistoryResult {
  items: SyncHistoryEntry[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * HistoryManager provides client-side access to revision history.
 *
 * NOTE: This class is currently a stub. The sync:listHistory IPC handler
 * in handlers.ts is the actual implementation. This class provides the
 * typed interface contract for potential future offline caching.
 *
 * Usage: Use window.electronAPI.sync.listHistory() directly from the renderer,
 * or call sync:listHistory via IPC. Do NOT call HistoryManager.listHistory
 * directly from core - it will throw.
 */
export class HistoryManager {
  /**
   * List revision history for a file.
   *
   * @deprecated Use window.electronAPI.sync.listHistory() or sync:listHistory IPC
   * directly. This method exists only for interface contract documentation.
   * @throws Error always - core cannot call IPC
   */
  async listHistory(_params: ListHistoryParams): Promise<ListHistoryResult> {
    throw new Error(
      'HistoryManager.listHistory is not implemented in core. ' +
      'Use sync:listHistory IPC handler in handlers.ts directly.'
    );
  }
}
