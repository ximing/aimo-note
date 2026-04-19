/**
 * Detect if the app is running in Electron environment
 * Checks for the presence of 'Electron' in the user agent string
 * or the presence of electronAPI (exposed by preload script)
 */
export function isElectron(): boolean {
  // First check userAgent (fast, synchronous)
  const hasElectronInUA =
    typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
  // Also check for electronAPI (more reliable, exposed by preload script)
  const hasElectronAPI = typeof window !== 'undefined' && !!window.electronAPI;

  return hasElectronInUA || hasElectronAPI;
}

/**
 * Get the platform the app is running on
 * Returns the platform string from Electron (darwin, win32, linux)
 * or 'browser' if running in a web browser
 */
export function getPlatform(): string {
  if (!isElectron()) {
    return 'browser';
  }
  const platform = window.electronAPI?.platform;
  if (typeof platform === 'string' && platform.length > 0) {
    return platform;
  }

  return 'unknown';
}

/**
 * Check if running on macOS
 */
export function isMacOS(): boolean {
  return getPlatform() === 'darwin';
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return getPlatform() === 'win32';
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return getPlatform() === 'linux';
}

/**
 * Register a callback for when files are dropped into the Electron window
 * This only works in Electron and will be a no-op in browser
 */
export function onFileDrop(callback: (filePaths: string[]) => void): () => void {
  if (!isElectron() || !window.electronAPI?.onFileDrop) {
    // Return a no-op cleanup function for browser
    return () => {};
  }

  window.electronAPI.onFileDrop(callback);

  // Return cleanup function
  return () => {
    window.electronAPI?.removeFileDropListener?.(callback);
  };
}

/**
 * Type definition for the Electron API exposed via preload script
 */
export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseNotes?: string;
  percent?: number;
  error?: string;
}

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      getVersion: () => string;
      onFileDrop?: (callback: (filePaths: string[]) => void) => void;
      removeFileDropListener?: (callback: (filePaths: string[]) => void) => void;
      // Vault APIs
      vault: {
        open: (path: string) => Promise<{ success: boolean; path?: string; tree?: TreeNode[]; error?: string }>;
        readNote: (vaultPath: string, notePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
        writeNote: (vaultPath: string, notePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
        delete: (vaultPath: string, notePath: string) => Promise<{ success: boolean; error?: string }>;
        list: (path: string) => Promise<{ success: boolean; tree?: TreeNode[]; error?: string }>;
        selectFolder: () => Promise<{ success: boolean; path?: string; error?: string }>;
        create: (path: string) => Promise<{ success: boolean; error?: string }>;
        createFolder: (vaultPath: string, folderPath: string) => Promise<{ success: boolean; error?: string }>;
        rename: (vaultPath: string, oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>;
      };
      // Plugin APIs
      plugin: {
        load: (pluginPath: string) => Promise<{ success: boolean; error?: string }>;
        unload: (pluginId: string) => Promise<{ success: boolean; error?: string }>;
        getSettings: (pluginId: string) => Promise<{ success: boolean; settings?: Record<string, unknown>; error?: string }>;
        setSettings: (pluginId: string, settings: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
      };
      // Search APIs
      search: {
        query: (query: string, limit?: number) => Promise<{ success: boolean; results?: unknown[]; error?: string }>;
        queryContent: (query: string) => Promise<{ success: boolean; results?: unknown[]; error?: string }>;
      };
      // Graph APIs
      graph: {
        build: () => Promise<{ success: boolean; error?: string }>;
        getBacklinks: (path: string) => Promise<{ success: boolean; links?: unknown[]; error?: string }>;
      };
      // FS APIs
      fs: {
        selectVault: () => Promise<{ success: boolean; path?: string; error?: string }>;
        readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>;
        writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>;
        exists: (path: string) => Promise<{ success: boolean; exists?: boolean; error?: string }>;
      };
      // Auto-update APIs
      checkForUpdates: () => Promise<UpdateInfo | null>;
      downloadUpdate: () => Promise<{ success: boolean }>;
      installUpdate: () => void;
      getAppVersion: () => Promise<string>;
      onUpdateStatus?: (callback: (status: UpdateStatus) => void) => void;
      removeUpdateStatusListener?: (callback: (status: UpdateStatus) => void) => void;
      // Secure storage (uses OS-level encryption via safeStorage)
      secureStoreSet: (
        key: string,
        value: string
      ) => Promise<{ success: boolean; warning?: string; error?: string }>;
      secureStoreGet: (
        key: string
      ) => Promise<{ success: boolean; value: string | null; error?: string }>;
      secureStoreDelete: (key: string) => Promise<{ success: boolean; error?: string }>;
      // Config APIs
      config: {
        getRecentVaults: () => Promise<RecentVault[]>;
        addRecentVault: (vaultPath: string) => Promise<{ success: boolean; recentVaults: RecentVault[] }>;
        removeRecentVault: (vaultPath: string) => Promise<{ success: boolean; recentVaults: RecentVault[] }>;
      };
      // Clipboard APIs
      clipboard: {
        readImage: () => Promise<{ success: boolean; data: { arrayBuffer: ArrayBuffer; mimeType: string } | null; error?: string }>;
      };
      // Image storage APIs
      imageStorage: {
        upload: (data: { arrayBuffer: ArrayBuffer; mimeType: string; vaultPath: string }) =>
          Promise<{ success: boolean; url?: string; error?: string }>;
        getConfig: (vaultPath: string) =>
          Promise<{ success: boolean; config?: ElectronImageStorageConfig | null }>;
        setConfig: (vaultPath: string, config: ElectronImageStorageConfig) =>
          Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

interface RecentVault {
  path: string;
  name: string;
  lastOpened: number;
}

interface TreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

type ElectronImageStorageConfig =
  | { type: 'local'; local: { path: string } }
  | {
      type: 's3';
      s3: {
        accessKey: string;
        secretKey: string;
        bucket: string;
        region: string;
        endpoint?: string;
        keyPrefix?: string;
      };
    };

