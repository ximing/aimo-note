import { watch, type FSWatcher } from 'chokidar';
import { basename, extname } from 'path';

export type VaultEventType = 'create' | 'update' | 'delete';
export type VaultEventCallback = (event: VaultEvent) => void;

export interface VaultEvent {
  type: VaultEventType;
  path: string; // Relative path from vault root
}

export class Watcher {
  private watcher: FSWatcher | null = null;
  private vaultPath: string;
  private callback: VaultEventCallback;
  private onError?: (err: Error) => void;

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
      ],
    });

    this.watcher.on('add', (filePath: string) => {
      this.callback({ type: 'create', path: this.getRelativePath(filePath) });
    });

    this.watcher.on('change', (filePath: string) => {
      this.callback({ type: 'update', path: this.getRelativePath(filePath) });
    });

    this.watcher.on('unlink', (filePath: string) => {
      this.callback({ type: 'delete', path: this.getRelativePath(filePath) });
    });

    this.watcher.on('error', (error: Error) => {
      console.error('File watcher error:', error);
      if (this.onError) {
        this.onError(error);
      }
    });
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