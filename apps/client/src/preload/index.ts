import { ipcRenderer, contextBridge, IpcRendererEvent, app } from 'electron';

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

export interface VaultResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  tree?: TreeNode[];
  content?: string;
  error?: string;
}

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
    create: (vaultPath: string) => ipcRenderer.invoke('vault:create', vaultPath) as Promise<VaultResult>,
    open: (vaultPath: string) => ipcRenderer.invoke('vault:open', vaultPath) as Promise<VaultResult>,
    readNote: (vaultPath: string, filePath: string) =>
      ipcRenderer.invoke('vault:readNote', vaultPath, filePath) as Promise<VaultResult>,
    writeNote: (vaultPath: string, filePath: string, content: string) =>
      ipcRenderer.invoke('vault:writeNote', vaultPath, filePath, content) as Promise<VaultResult>,
    delete: (vaultPath: string, filePath: string) =>
      ipcRenderer.invoke('vault:delete', vaultPath, filePath) as Promise<VaultResult>,
    rename: (vaultPath: string, oldPath: string, newPath: string) =>
      ipcRenderer.invoke('vault:rename', vaultPath, oldPath, newPath) as Promise<VaultResult>,
    createFolder: (vaultPath: string, folderPath: string) =>
      ipcRenderer.invoke('vault:createFolder', vaultPath, folderPath) as Promise<VaultResult>,
    list: (vaultPath: string) => ipcRenderer.invoke('vault:list', vaultPath) as Promise<VaultResult>,
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
        readNote: (vaultPath: string, filePath: string) => Promise<VaultResult>;
        writeNote: (vaultPath: string, filePath: string, content: string) => Promise<VaultResult>;
        delete: (vaultPath: string, filePath: string) => Promise<VaultResult>;
        rename: (vaultPath: string, oldPath: string, newPath: string) => Promise<VaultResult>;
        createFolder: (vaultPath: string, folderPath: string) => Promise<VaultResult>;
        list: (vaultPath: string) => Promise<VaultResult>;
      };
    };
  }
}

export type ElectronAPI = Window['electronAPI'];
