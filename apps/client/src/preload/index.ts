import { ipcRenderer, contextBridge, IpcRendererEvent, app } from 'electron';
import type { SearchResult } from '@aimo-note/dto';

type MessageCallback = (message: string) => void;
type FileDropCallback = (filePaths: string[]) => void;

// Update status callback type
type UpdateStatusCallback = (status: UpdateStatus) => void;

// Update status type
export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseNotes?: string;
  percent?: number;
  error?: string;
}

// Image storage types
export type ImageStorageType = 'local' | 's3';

export interface LocalImageStorageConfig {
  type: 'local';
  local: {
    path: string;
  };
}

export interface S3ImageStorageConfig {
  type: 's3';
  s3: {
    accessKey: string;
    secretKey: string;
    bucket: string;
    region: string;
    endpoint?: string;
    keyPrefix?: string;
  };
}

export type ImageStorageConfig = LocalImageStorageConfig | S3ImageStorageConfig;

export interface ClipboardImageData {
  arrayBuffer: ArrayBuffer;
  mimeType: string;
}

// Update info type
export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

// Vault types
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

export interface RecentVault {
  path: string;
  name: string;
  lastOpened: number;
}

export interface VaultResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  tree?: TreeNode[];
  content?: string;
  error?: string;
}

export interface ReadNoteResult extends VaultResult {
  frontmatter: Record<string, unknown>;
}

// Search types are imported from @aimo-note/dto

// Store wrapped callbacks to allow proper removal
const messageCallbackMap = new Map<
  MessageCallback,
  (event: IpcRendererEvent, message: string) => void
>();
const fileDropCallbackMap = new Map<
  FileDropCallback,
  (event: IpcRendererEvent, filePaths: string[]) => void
>();
const updateStatusCallbackMap = new Map<
  UpdateStatusCallback,
  (event: IpcRendererEvent, status: UpdateStatus) => void
>();

// Log platform info for debugging
console.log('Preload script loaded, platform:', process.platform);
// Also send to main process via IPC for better visibility
ipcRenderer.invoke('log-preload', { platform: process.platform });

// --------- Expose API to Renderer process ---------
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,

  // App version
  getVersion: () => app.getVersion(),

  // IPC communication
  onMainMessage: (callback: MessageCallback) => {
    const wrappedCallback = (_event: IpcRendererEvent, message: string) => {
      callback(message);
    };
    messageCallbackMap.set(callback, wrappedCallback);
    ipcRenderer.on('main-process-message', wrappedCallback);
  },

  removeMainMessageListener: (callback: MessageCallback) => {
    const wrappedCallback = messageCallbackMap.get(callback);
    if (wrappedCallback) {
      ipcRenderer.removeListener('main-process-message', wrappedCallback);
      messageCallbackMap.delete(callback);
    }
  },

  // File drag and drop
  onFileDrop: (callback: FileDropCallback) => {
    const wrappedCallback = (_event: IpcRendererEvent, filePaths: string[]) => {
      callback(filePaths);
    };
    fileDropCallbackMap.set(callback, wrappedCallback);
    ipcRenderer.on('files-dropped', wrappedCallback);
  },

  removeFileDropListener: (callback: FileDropCallback) => {
    const wrappedCallback = fileDropCallbackMap.get(callback);
    if (wrappedCallback) {
      ipcRenderer.removeListener('files-dropped', wrappedCallback);
      fileDropCallbackMap.delete(callback);
    }
  },

  // Auto-update APIs
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Secure storage (uses OS-level encryption via safeStorage)
  secureStoreSet: (key: string, value: string) =>
    ipcRenderer.invoke('secure-store-set', { key, value }),
  secureStoreGet: (key: string) => ipcRenderer.invoke('secure-store-get', { key }),
  secureStoreDelete: (key: string) => ipcRenderer.invoke('secure-store-delete', { key }),

  // Vault operations
  vault: {
    selectFolder: () => ipcRenderer.invoke('vault:selectFolder') as Promise<VaultResult>,
    create: (vaultPath: string) =>
      ipcRenderer.invoke('vault:create', vaultPath) as Promise<VaultResult>,
    open: (vaultPath: string) =>
      ipcRenderer.invoke('vault:open', vaultPath) as Promise<VaultResult>,
    readNote: (vaultPath: string, filePath: string) =>
      ipcRenderer.invoke('vault:readNote', vaultPath, filePath) as Promise<ReadNoteResult>,
    writeNote: (vaultPath: string, filePath: string, content: string) =>
      ipcRenderer.invoke('vault:writeNote', vaultPath, filePath, content) as Promise<VaultResult>,
    delete: (vaultPath: string, filePath: string) =>
      ipcRenderer.invoke('vault:delete', vaultPath, filePath) as Promise<VaultResult>,
    rename: (vaultPath: string, oldPath: string, newPath: string) =>
      ipcRenderer.invoke('vault:rename', vaultPath, oldPath, newPath) as Promise<VaultResult>,
    createFolder: (vaultPath: string, folderPath: string) =>
      ipcRenderer.invoke('vault:createFolder', vaultPath, folderPath) as Promise<VaultResult>,
    list: (vaultPath: string) =>
      ipcRenderer.invoke('vault:list', vaultPath) as Promise<VaultResult>,
  },

  // Update status listener
  onUpdateStatus: (callback: UpdateStatusCallback) => {
    const wrappedCallback = (_event: IpcRendererEvent, status: UpdateStatus) => {
      callback(status);
    };
    updateStatusCallbackMap.set(callback, wrappedCallback);
    ipcRenderer.on('update-status', wrappedCallback);
  },

  removeUpdateStatusListener: (callback: UpdateStatusCallback) => {
    const wrappedCallback = updateStatusCallbackMap.get(callback);
    if (wrappedCallback) {
      ipcRenderer.removeListener('update-status', wrappedCallback);
      updateStatusCallbackMap.delete(callback);
    }
  },

  // Config operations for recent vaults
  config: {
    getRecentVaults: () => ipcRenderer.invoke('config:getRecentVaults'),
    addRecentVault: (vaultPath: string) => ipcRenderer.invoke('config:addRecentVault', vaultPath),
    removeRecentVault: (vaultPath: string) =>
      ipcRenderer.invoke('config:removeRecentVault', vaultPath),
  },

  // Clipboard operations
  clipboard: {
    readImage: () => ipcRenderer.invoke('clipboard:read-image'),
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  },

  // Shell operations
  shell: {
    openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  },

  // Image storage operations
  imageStorage: {
    upload: (data: { arrayBuffer: ArrayBuffer; mimeType: string; vaultPath: string }) =>
      ipcRenderer.invoke('image-storage:upload', data),
    getConfig: (vaultPath: string) => ipcRenderer.invoke('image-storage:get-config', vaultPath),
    setConfig: (vaultPath: string, config: ImageStorageConfig) =>
      ipcRenderer.invoke('image-storage:set-config', vaultPath, config),
  },

  // Search operations
  search: {
    search: (options: {
      query: string;
      rootPath: string;
      caseSensitive: boolean;
      isRegex: boolean;
    }) =>
      ipcRenderer.invoke('search:search', options) as Promise<{
        success: boolean;
        results: SearchResult[];
        error?: string;
      }>,
  },

  // Template operations
  template: {
    list: (vaultPath: string) =>
      ipcRenderer.invoke('template:list', vaultPath) as Promise<{
        success: boolean;
        templates: Array<{ fileName: string; fieldCount: number; preview: string }>;
        error?: string;
      }>,
    read: (vaultPath: string, fileName: string) =>
      ipcRenderer.invoke('template:read', vaultPath, fileName) as Promise<{
        success: boolean;
        content?: string;
        error?: string;
      }>,
    write: (vaultPath: string, fileName: string, content: string) =>
      ipcRenderer.invoke('template:write', vaultPath, fileName, content) as Promise<{
        success: boolean;
        error?: string;
      }>,
    delete: (vaultPath: string, fileName: string) =>
      ipcRenderer.invoke('template:delete', vaultPath, fileName) as Promise<{
        success: boolean;
        error?: string;
      }>,
    getMappings: (vaultPath: string) =>
      ipcRenderer.invoke('template:getMappings', vaultPath) as Promise<{
        success: boolean;
        mappings: Record<string, string>;
        error?: string;
      }>,
    setMappings: (vaultPath: string, mappings: Record<string, string>) =>
      ipcRenderer.invoke('template:setMappings', vaultPath, mappings) as Promise<{
        success: boolean;
        error?: string;
      }>,
  },

  // Sync operations
  sync: {
    getStatus: () =>
      ipcRenderer.invoke('sync:getStatus') as Promise<{
        success: boolean;
        status?: string;
        lastSyncAt?: string | null;
        error?: string | null;
        pendingCount?: number;
        isEnabled?: boolean;
        vaultId?: string | null;
        vaultName?: string | null;
      }>,
    trigger: () =>
      ipcRenderer.invoke('sync:trigger') as Promise<{
        success: boolean;
        error?: string;
      }>,
    getConflicts: () =>
      ipcRenderer.invoke('sync:getConflicts') as Promise<{
        success: boolean;
        conflicts: Array<{
          id: number;
          filePath: string;
          localVersion: string;
          remoteVersion: string;
          localHash: string;
          remoteHash: string;
          createdAt: string;
          resolved: boolean;
          resolutionPath: string | null;
        }>;
        error?: string;
      }>,
    resolveConflict: (id: number, resolutionPath: string) =>
      ipcRenderer.invoke('sync:resolveConflict', id, resolutionPath) as Promise<{
        success: boolean;
        error?: string;
      }>,
    rollback: (filePath: string, targetVersion: string) =>
      ipcRenderer.invoke('sync:rollback', filePath, targetVersion) as Promise<{
        success: boolean;
        error?: string;
      }>,
    configure: (serverUrl: string, deviceId: string) =>
      ipcRenderer.invoke('sync:configure', serverUrl, deviceId) as Promise<{
        success: boolean;
        error?: string;
      }>,
    listVaults: () =>
      ipcRenderer.invoke('sync:listVaults') as Promise<{
        success: boolean;
        vaults?: Array<{ id: string; name: string; description?: string }>;
        error?: string;
      }>,
    createVault: (name: string, description?: string) =>
      ipcRenderer.invoke('sync:createVault', name, description) as Promise<{
        success: boolean;
        vault?: { id: string; name: string; description?: string };
        error?: string;
      }>,
    bindVault: (vaultId: string) =>
      ipcRenderer.invoke('sync:bindVault', vaultId) as Promise<{
        success: boolean;
        error?: string;
      }>,
    unbindVault: () =>
      ipcRenderer.invoke('sync:unbindVault') as Promise<{
        success: boolean;
        error?: string;
      }>,
    registerDevice: (vaultId: string, deviceName: string) =>
      ipcRenderer.invoke('sync:registerDevice', vaultId, deviceName) as Promise<{
        success: boolean;
        deviceId?: string;
        error?: string;
      }>,
  },
});

// --------- Type definitions for Renderer process ---------
declare global {
  interface Window {
    electronAPI: {
      platform: string;
      getVersion: () => string;
      onMainMessage: (callback: (message: string) => void) => void;
      removeMainMessageListener: (callback: (message: string) => void) => void;
      onFileDrop: (callback: (filePaths: string[]) => void) => void;
      removeFileDropListener: (callback: (filePaths: string[]) => void) => void;
      // Auto-update APIs
      checkForUpdates: () => Promise<UpdateInfo | null>;
      downloadUpdate: () => Promise<{ success: boolean }>;
      installUpdate: () => void;
      getAppVersion: () => Promise<string>;
      // Secure storage (uses OS-level encryption via safeStorage)
      secureStoreSet: (
        key: string,
        value: string
      ) => Promise<{ success: boolean; warning?: string; error?: string }>;
      secureStoreGet: (
        key: string
      ) => Promise<{ success: boolean; value: string | null; error?: string }>;
      secureStoreDelete: (key: string) => Promise<{ success: boolean; error?: string }>;
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => void;
      removeUpdateStatusListener: (callback: (status: UpdateStatus) => void) => void;
      // Vault operations
      vault: {
        selectFolder: () => Promise<VaultResult>;
        create: (vaultPath: string) => Promise<VaultResult>;
        open: (vaultPath: string) => Promise<VaultResult>;
        readNote: (vaultPath: string, filePath: string) => Promise<ReadNoteResult>;
        writeNote: (vaultPath: string, filePath: string, content: string) => Promise<VaultResult>;
        delete: (vaultPath: string, filePath: string) => Promise<VaultResult>;
        rename: (vaultPath: string, oldPath: string, newPath: string) => Promise<VaultResult>;
        createFolder: (vaultPath: string, folderPath: string) => Promise<VaultResult>;
        list: (vaultPath: string) => Promise<VaultResult>;
      };
      // Config operations
      config: {
        getRecentVaults: () => Promise<RecentVault[]>;
        addRecentVault: (
          vaultPath: string
        ) => Promise<{ success: boolean; recentVaults: RecentVault[] }>;
        removeRecentVault: (
          vaultPath: string
        ) => Promise<{ success: boolean; recentVaults: RecentVault[] }>;
      };
      // Clipboard operations
      clipboard: {
        readImage: () => Promise<{
          success: boolean;
          data: ClipboardImageData | null;
          error?: string;
        }>;
        writeText: (text: string) => Promise<{ success: boolean; error?: string }>;
      };
      // Shell operations
      shell: {
        openPath: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      };
      // Image storage operations
      imageStorage: {
        upload: (data: {
          arrayBuffer: ArrayBuffer;
          mimeType: string;
          vaultPath: string;
        }) => Promise<{ success: boolean; url?: string; error?: string }>;
        getConfig: (
          vaultPath: string
        ) => Promise<{ success: boolean; config: ImageStorageConfig | null }>;
        setConfig: (
          vaultPath: string,
          config: ImageStorageConfig
        ) => Promise<{ success: boolean; error?: string }>;
      };
      // Search operations
      search: {
        search: (options: {
          query: string;
          rootPath: string;
          caseSensitive: boolean;
          isRegex: boolean;
        }) => Promise<{
          success: boolean;
          results: SearchResult[];
          error?: string;
        }>;
      };
      // Template operations
      template: {
        list: (vaultPath: string) => Promise<{
          success: boolean;
          templates: Array<{ fileName: string; fieldCount: number; preview: string }>;
          error?: string;
        }>;
        read: (
          vaultPath: string,
          fileName: string
        ) => Promise<{
          success: boolean;
          content?: string;
          error?: string;
        }>;
        write: (
          vaultPath: string,
          fileName: string,
          content: string
        ) => Promise<{
          success: boolean;
          error?: string;
        }>;
        delete: (
          vaultPath: string,
          fileName: string
        ) => Promise<{
          success: boolean;
          error?: string;
        }>;
        getMappings: (vaultPath: string) => Promise<{
          success: boolean;
          mappings: Record<string, string>;
          error?: string;
        }>;
        setMappings: (
          vaultPath: string,
          mappings: Record<string, string>
        ) => Promise<{
          success: boolean;
          error?: string;
        }>,
      },

      // Sync operations
      sync: {
        getStatus: () => Promise<{
          success: boolean;
          status?: string;
          lastSyncAt?: string | null;
          error?: string | null;
          pendingCount?: number;
          isEnabled?: boolean;
          vaultId?: string | null;
          vaultName?: string | null;
        }>;
        trigger: () => Promise<{ success: boolean; error?: string }>;
        getConflicts: () => Promise<{
          success: boolean;
          conflicts: Array<{
            id: number;
            filePath: string;
            localVersion: string;
            remoteVersion: string;
            localHash: string;
            remoteHash: string;
            createdAt: string;
            resolved: boolean;
            resolutionPath: string | null;
          }>;
          error?: string;
        }>;
        resolveConflict: (
          id: number,
          resolutionPath: string
        ) => Promise<{ success: boolean; error?: string }>;
        rollback: (
          filePath: string,
          targetVersion: string
        ) => Promise<{ success: boolean; error?: string }>;
        configure: (
          serverUrl: string,
          deviceId: string
        ) => Promise<{ success: boolean; error?: string }>;
        listVaults: () => Promise<{
          success: boolean;
          vaults?: Array<{ id: string; name: string; description?: string }>;
          error?: string;
        }>;
        createVault: (
          name: string,
          description?: string
        ) => Promise<{
          success: boolean;
          vault?: { id: string; name: string; description?: string };
          error?: string;
        }>;
        bindVault: (vaultId: string) => Promise<{ success: boolean; error?: string }>;
        unbindVault: () => Promise<{ success: boolean; error?: string }>;
        registerDevice: (
          vaultId: string,
          deviceName: string
        ) => Promise<{ success: boolean; deviceId?: string; error?: string }>;
      },
    };
  }
}

export type ElectronAPI = Window['electronAPI'];
