import { watch, type FSWatcher } from 'chokidar';
import { basename, extname } from 'path';

export type VaultEventType = 'create' | 'update' | 'delete';
export type VaultEventCallback = (event: VaultEvent) => void;

export interface VaultEvent {
  type: VaultEventType;
  path: string; // Relative path from vault root
}

/**
 * Check if a path should be ignored based on:
 * 1. Hidden files/directories (starting with '.')
 * 2. Non-markdown files (.md/.mdx only)
 * 3. Paths under .aimo-note/ directory
 */
function shouldIgnorePath(filePath: string): boolean {
  // Normalize to forward slashes for consistent checking
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Ignore hidden files and directories
  if (basename(normalizedPath).startsWith('.')) {
    return true;
  }

  // Ignore non-markdown files
  const ext = extname(normalizedPath);
  if (ext && ext !== '.md' && ext !== '.mdx') {
    return true;
  }

  // Ignore paths under .aimo-note/ directory
  const pathParts = normalizedPath.split('/');
  if (pathParts.some(part => part === '.aimo-note')) {
    return true;
  }

  return false;
}

export class Watcher {
  private watcher: FSWatcher | null = null;
  private vaultPath: string;
  private callback: VaultEventCallback;
  private onError?: (err: Error) => void;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly debounceMs = 400;

  constructor(vaultPath: string, callback: VaultEventCallback, onError?: (err: Error) => void) {
    // Normalize vaultPath by removing trailing slash
    this.vaultPath = vaultPath.endsWith('/') ? vaultPath.slice(0, -1) : vaultPath;
    this.callback = callback;
    this.onError = onError;

    this.watcher = watch(this.vaultPath, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      depth: 99,
      ignored: [
        // Ignore hidden files and directories
        (path: string) => basename(path).startsWith('.'),
        // Ignore non-markdown files
        (path: string) => extname(path) !== '.md' && extname(path) !== '.mdx',
        // Ignore .aimo-note directory and its contents
        (path: string) => {
          const normalized = path.replace(/\\/g, '/');
          const parts = normalized.split('/');
          return parts.includes('.aimo-note');
        },
      ],
    });

    this.watcher.on('add', (filePath: string) => {
      this.debouncedEmit('create', filePath);
    });

    this.watcher.on('change', (filePath: string) => {
      this.debouncedEmit('update', filePath);
    });

    this.watcher.on('unlink', (filePath: string) => {
      this.debouncedEmit('delete', filePath);
    });

    this.watcher.on('error', (error: Error) => {
      console.error('File watcher error:', error);
      if (this.onError) {
        this.onError(error);
      }
    });
  }

  private debouncedEmit(type: VaultEventType, filePath: string): void {
    const relativePath = this.getRelativePath(filePath);
    const key = `${type}:${relativePath}`;

    // Clear existing timer for this path+type combination
    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      // Check .aimo-note again after debounce delay (path could have been renamed)
      if (!shouldIgnorePath(filePath)) {
        this.callback({ type, path: relativePath });
      }
    }, this.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }

  private getRelativePath(filePath: string): string {
    // Normalize Windows backslashes to forward slashes for consistent comparison
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedVaultPath = this.vaultPath.replace(/\\/g, '/');
    // Remove vaultPath prefix to get relative path
    if (normalizedPath.startsWith(normalizedVaultPath + '/')) {
      return normalizedPath.slice(normalizedVaultPath.length + 1);
    }
    return normalizedPath;
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}