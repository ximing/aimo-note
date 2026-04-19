import { Service, resolve } from '@rabjs/react';
import { vault } from '@/ipc/vault';
import { config } from '@/ipc/config';
import type { TreeNode } from '@/ipc/vault';
import type { RecentVault } from '@/ipc/config';

function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const STORAGE_KEY_CURRENT_NOTE = 'aimo-note-current-note';

interface SavedState {
  vaultPath: string | null;
  currentNotePath: string | null;
}

export class VaultService extends Service {
  path: string | null = null;
  tree: TreeNode[] = [];
  activeFile: string | null = null;
  isLoading = false;
  recentVaults: RecentVault[] = [];

  private _currentNotePath: string | null = null;

  get currentNotePath(): string | null {
    return this._currentNotePath;
  }

  set currentNotePath(value: string | null) {
    this._currentNotePath = value;
    this.persistState();
  }

  private persistState(): void {
    const state: SavedState = {
      vaultPath: this.path,
      currentNotePath: this._currentNotePath,
    };
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT_NOTE, JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }

  private loadSavedState(): SavedState | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CURRENT_NOTE);
      if (saved) {
        return JSON.parse(saved) as SavedState;
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  async loadRecentVaults(): Promise<void> {
    this.recentVaults = await config.getRecentVaults();
  }

  async initialize(): Promise<void> {
    await this.loadRecentVaults();
    // Auto-open most recent vault if available
    if (!this.path && this.recentVaults.length > 0) {
      await this.openRecentVault(this.recentVaults[0].path);
    }
    // Restore saved state
    const savedState = this.loadSavedState();
    if (savedState?.currentNotePath) {
      this._currentNotePath = savedState.currentNotePath;
      // Also restore activeFile for tree selection highlight
      this.activeFile = savedState.currentNotePath;
    }
  }

  async openVault(path: string): Promise<void> {
    this.isLoading = true;
    try {
      const result = await vault.open(path);
      if (result) {
        this.path = result.path;
        await this.refreshTree();
        // Add to recent vaults
        this.recentVaults = await config.addRecentVault(path);
      }
    } finally {
      this.isLoading = false;
    }
  }

  async refreshTree(): Promise<void> {
    if (!this.path) return;
    this.tree = await vault.list(this.path);
  }

  async selectAndOpenVault(): Promise<boolean> {
    const path = await vault.selectFolder();
    if (path) {
      await this.openVault(path);
      return true;
    }
    return false;
  }

  async openRecentVault(vaultPath: string): Promise<boolean> {
    this.isLoading = true;
    try {
      const result = await vault.open(vaultPath);
      if (result) {
        this.path = vaultPath;
        await this.refreshTree();
        // Update recent vaults
        this.recentVaults = await config.addRecentVault(vaultPath);
        return true;
      }
      return false;
    } catch {
      // Remove from recent if cannot open
      this.recentVaults = await config.removeRecentVault(vaultPath);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  async createAndOpenVault(): Promise<boolean> {
    const path = await vault.selectFolder();
    if (path) {
      await vault.create(path);
      await this.openVault(path);
      return true;
    }
    return false;
  }

  async removeRecentVault(vaultPath: string): Promise<void> {
    this.recentVaults = await config.removeRecentVault(vaultPath);
  }

  async loadTabs(): Promise<{ openTabs: Array<{ id: string; path: string }>; activeTabId: string | null } | null> {
    if (!this.path) return null;
    try {
      const result = await vault.readNote(this.path, '.aimo-note/config.json');
      return JSON.parse(result.content);
    } catch {
      return null; // config doesn't exist yet
    }
  }

  private debouncedSaveTabs = debounce(async (tabs: Array<{ id: string; path: string }>, activeTabId: string | null) => {
    if (!this.path) return;
    const config: { openTabs: Array<{ id: string; path: string }>; activeTabId: string | null } = { openTabs: tabs, activeTabId };
    await vault.writeNote(this.path, '.aimo-note/config.json', JSON.stringify(config, null, 2));
  }, 300);

  saveTabs(tabs: Array<{ id: string; path: string }>, activeTabId: string | null): void {
    this.debouncedSaveTabs(tabs, activeTabId);
  }

  setActiveFile(path: string | null): void {
    this.activeFile = path;
    this._currentNotePath = path;
    this.persistState();
  }

  get vaultPath(): string | null {
    return this.path;
  }

  async createNote(parentPath: string, name: string): Promise<void> {
    const fullPath = `${parentPath}/${name}`;
    await vault.writeNote(this.path!, fullPath, `# ${name}\n\n`);
    await this.refreshTree();
  }

  async createFolder(parentPath: string, name: string): Promise<void> {
    const fullPath = `${parentPath}/${name}`;
    await vault.createFolder(this.path!, fullPath);
    await this.refreshTree();
  }

  async renameNode(node: TreeNode, newName: string): Promise<void> {
    const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
    const newPath = `${parentPath}/${newName}`;
    await vault.rename(this.path!, node.path, newPath);
    await this.refreshTree();
  }

  async deleteNode(node: TreeNode): Promise<void> {
    await vault.deleteNote(this.path!, node.path);
    await this.refreshTree();
  }
}

export function useVaultService(): VaultService {
  return resolve(VaultService);
}
