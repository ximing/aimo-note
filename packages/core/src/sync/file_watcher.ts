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

  constructor(vaultPath: string, callback: VaultEventCallback) {
    // Normalize vaultPath by removing trailing slash
    this.vaultPath = vaultPath.endsWith('/') ? vaultPath.slice(0, -1) : vaultPath;
    this.callback = callback;

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
    });
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }

  private getRelativePath(filePath: string): string {
    // Remove vaultPath prefix to get relative path
    if (filePath.startsWith(this.vaultPath + '/')) {
      return filePath.slice(this.vaultPath.length + 1);
    }
    return filePath;
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}