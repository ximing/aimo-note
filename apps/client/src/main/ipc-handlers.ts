import { app, ipcMain, safeStorage } from 'electron';
import Store from 'electron-store';

import { checkForUpdates, downloadUpdate, installUpdate } from './updater';

interface AuthStore {
  encryptedToken: string | null;
}

// Persistent store for encrypted token (survives app restarts)
const authStore = new Store<AuthStore>({
  name: 'auth',
  defaults: { encryptedToken: null },
});

export function registerIpcHandlers(): void {
  ipcMain.handle('log-preload', (_event, data) => {
    console.log('[Preload] Debug info:', data);
    return { success: true };
  });

  // Secure storage for auth token (uses OS-level encryption + persistent file storage)
  ipcMain.handle('secure-store-set', (_event, { key, value }: { key: string; value: string }) => {
    try {
      if (key === 'auth_token') {
        if (safeStorage.isEncryptionAvailable()) {
          const encrypted = safeStorage.encryptString(value);
          authStore.set('encryptedToken', encrypted.toString('base64'));
          return { success: true };
        } else {
          console.warn('safeStorage encryption not available, using plaintext storage');
          authStore.set('encryptedToken', value);
          return { success: true, warning: 'encryption_not_available' };
        }
      }
      return { success: false, error: 'Unknown key' };
    } catch (error) {
      console.error('Failed to store secure value:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('secure-store-get', (_event, { key }: { key: string }) => {
    try {
      if (key === 'auth_token') {
        const stored = authStore.get('encryptedToken');
        if (!stored) return { success: true, value: null };

        if (safeStorage.isEncryptionAvailable()) {
          const buffer = Buffer.from(stored, 'base64');
          const decrypted = safeStorage.decryptString(buffer);
          return { success: true, value: decrypted };
        } else {
          return { success: true, value: stored };
        }
      }
      return { success: true, value: null };
    } catch (error) {
      console.error('Failed to get secure value:', error);
      return { success: false, error: String(error), value: null };
    }
  });

  ipcMain.handle('secure-store-delete', (_event, { key }: { key: string }) => {
    try {
      if (key === 'auth_token') {
        authStore.set('encryptedToken', null);
        return { success: true };
      }
      return { success: false, error: 'Unknown key' };
    } catch (error) {
      console.error('Failed to delete secure value:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('check-for-updates', async () => {
    return await checkForUpdates();
  });

  ipcMain.handle('download-update', async () => {
    await downloadUpdate();
    return { success: true };
  });

  ipcMain.handle('install-update', () => {
    installUpdate();
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // Vault handlers (core vault operations)
  // TODO: Replace stubs with actual VaultService calls when @aimo-note/core is integrated
  ipcMain.handle('vault:open', async (_event, options) => {
    console.log('[IPC] vault:open', options);
    return { success: true };
  });

  ipcMain.handle('vault:close', async () => {
    console.log('[IPC] vault:close');
    return { success: true };
  });

  ipcMain.handle('vault:getNote', async (_event, id: string) => {
    console.log('[IPC] vault:getNote', id);
    return null;
  });

  ipcMain.handle('vault:getAllNotes', async () => {
    console.log('[IPC] vault:getAllNotes');
    return [];
  });

  ipcMain.handle('vault:createNote', async (_event, metadata, content) => {
    console.log('[IPC] vault:createNote', metadata);
    throw new Error('Not implemented');
  });

  ipcMain.handle('vault:updateNote', async (_event, id, metadata, content) => {
    console.log('[IPC] vault:updateNote', id);
    throw new Error('Not implemented');
  });

  ipcMain.handle('vault:deleteNote', async (_event, id: string) => {
    console.log('[IPC] vault:deleteNote', id);
    throw new Error('Not implemented');
  });

  // Graph handlers (core graph operations)
  ipcMain.handle('graph:getGraph', async () => {
    console.log('[IPC] graph:getGraph');
    return { nodes: [], edges: [] };
  });

  ipcMain.handle('graph:getBacklinks', async (_event, noteId: string) => {
    console.log('[IPC] graph:getBacklinks', noteId);
    return [];
  });

  ipcMain.handle('graph:getOutlinks', async (_event, noteId: string) => {
    console.log('[IPC] graph:getOutlinks', noteId);
    return [];
  });

  // Search handlers (core search operations)
  ipcMain.handle('search:search', async (_event, options) => {
    console.log('[IPC] search:search', options);
    return [];
  });

  ipcMain.handle('search:searchTitle', async (_event, query, limit) => {
    console.log('[IPC] search:searchTitle', query);
    return [];
  });

  ipcMain.handle('search:reindex', async () => {
    console.log('[IPC] search:reindex');
    throw new Error('Not implemented');
  });

  console.log('[IPC] Vault/Graph/Search handlers registered');
}
