import { Service, resolve } from '@rabjs/react';
import { vault } from '@/ipc/vault';
import type { TabConfig } from '@/ipc/vault';
import { config } from '@/ipc/config';
import type { TreeNode } from '@/ipc/vault';
import type { RecentVault } from '@/ipc/config';
import { UIService } from './ui.service';
import { ImageStorageService } from './image-storage.service';
import { TemplateService } from './template.service';

function debounce<Args extends unknown[], R>(
  fn: (...args: Args) => R,
  ms: number
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const STORAGE_KEY_CURRENT_NOTE = 'aimo-note-current-note';
const VAULT_CONFIG_PATH = '.aimo-note/config.json';

export interface UIConfig {
  leftSidebarWidth?: number;
  expandedPaths?: string[];
}

interface VaultConfig extends UIConfig {
  openTabs?: TabConfig['openTabs'];
  activeTabId?: string | null;
}

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
  expandedPaths: Set<string> = new Set();

  private getAncestorFolderPaths(filePath: string): string[] {
    const segments = filePath.split('/').filter(Boolean);
    if (segments.length <= 1) return [];

    const ancestors: string[] = [];
    for (let index = 1; index < segments.length; index += 1) {
      ancestors.push(segments.slice(0, index).join('/'));
    }
    return ancestors;
  }

  private _currentNotePath: string | null = null;
  private _pendingVaultConfig: Partial<VaultConfig> = {};
  private _pendingVaultConfigPath: string | null = null;

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

  private async loadVaultConfig(vaultPath: string | null = this.path): Promise<VaultConfig | null> {
    if (!vaultPath) return null;
    try {
      const result = await vault.readNote(vaultPath, VAULT_CONFIG_PATH);
      return JSON.parse(result.content) as VaultConfig;
    } catch {
      return null;
    }
  }

  private queueVaultConfigUpdate(partial: Partial<VaultConfig>): void {
    if (!this.path) return;

    if (this._pendingVaultConfigPath && this._pendingVaultConfigPath !== this.path) {
      this._pendingVaultConfig = {};
    }

    this._pendingVaultConfigPath = this.path;
    this._pendingVaultConfig = {
      ...this._pendingVaultConfig,
      ...partial,
    };
    this.debouncedSaveVaultConfig();
  }

  private debouncedSaveVaultConfig = debounce(async () => {
    const vaultPath = this._pendingVaultConfigPath;
    const pending = this._pendingVaultConfig;

    if (!vaultPath || Object.keys(pending).length === 0) {
      return;
    }

    this._pendingVaultConfig = {};
    this._pendingVaultConfigPath = null;

    try {
      const existing = await this.loadVaultConfig(vaultPath);
      const merged: VaultConfig = { ...existing, ...pending };
      await vault.writeNote(vaultPath, VAULT_CONFIG_PATH, JSON.stringify(merged, null, 2));
    } catch {
      this._pendingVaultConfig = {
        ...pending,
        ...this._pendingVaultConfig,
      };
      this._pendingVaultConfigPath = vaultPath;
    }
  }, 300);

  private async restoreVaultConfig(): Promise<void> {
    if (!this.path) return;

    const vaultConfig = await this.loadVaultConfig();
    const uiService = this.resolve(UIService);

    if (vaultConfig?.openTabs?.length) {
      uiService.restoreTabs(vaultConfig.openTabs, vaultConfig.activeTabId ?? null);
    } else {
      uiService.restoreTabs([], null);
    }

    if (typeof vaultConfig?.leftSidebarWidth === 'number') {
      uiService.setLeftSidebarWidth(vaultConfig.leftSidebarWidth);
    }

    this.expandedPaths = new Set(vaultConfig?.expandedPaths ?? []);
  }

  async loadRecentVaults(): Promise<void> {
    this.recentVaults = await config.getRecentVaults();
  }

  async initialize(): Promise<void> {
    await this.loadRecentVaults();

    if (!this.path && this.recentVaults.length > 0) {
      await this.openRecentVault(this.recentVaults[0].path);
    }

    const savedState = this.loadSavedState();
    if (savedState?.vaultPath === this.path && savedState.currentNotePath) {
      this._currentNotePath = savedState.currentNotePath;
      this.activeFile = savedState.currentNotePath;
    }

    await this.restoreVaultConfig();
  }

  async openVault(path: string): Promise<void> {
    this.isLoading = true;
    try {
      const result = await vault.open(path);
      if (result) {
        this.path = result.path;
        this.persistState();
        await this.refreshTree();
        await this.restoreVaultConfig();
        const imageStorageService = this.resolve(ImageStorageService);
        await imageStorageService.loadConfig();
        const templateService = this.resolve(TemplateService);
        await templateService.loadTemplates();
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
        this.persistState();
        await this.refreshTree();
        await this.restoreVaultConfig();
        const imageStorageService = this.resolve(ImageStorageService);
        await imageStorageService.loadConfig();
        const templateService = this.resolve(TemplateService);
        await templateService.loadTemplates();
        this.recentVaults = await config.addRecentVault(vaultPath);
        return true;
      }
      return false;
    } catch {
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

  async loadTabs(): Promise<TabConfig | null> {
    const vaultConfig = await this.loadVaultConfig();
    if (!vaultConfig?.openTabs) return null;

    return {
      openTabs: vaultConfig.openTabs,
      activeTabId: vaultConfig.activeTabId ?? null,
    };
  }

  saveTabs(tabs: Array<{ id: string; path: string }>, activeTabId: string | null): void {
    this.queueVaultConfigUpdate({
      openTabs: tabs,
      activeTabId,
    });
  }

  async loadUISettings(): Promise<UIConfig | null> {
    const vaultConfig = await this.loadVaultConfig();
    if (!vaultConfig) return null;

    return {
      leftSidebarWidth: vaultConfig.leftSidebarWidth,
      expandedPaths: vaultConfig.expandedPaths,
    };
  }

  saveUISettings(settings: UIConfig): void {
    this.queueVaultConfigUpdate(settings);
  }

  setActiveFile(path: string | null): void {
    this.activeFile = path;
    this._currentNotePath = path;

    if (path) {
      const nextExpandedPaths = new Set(this.expandedPaths);
      for (const ancestorPath of this.getAncestorFolderPaths(path)) {
        nextExpandedPaths.add(ancestorPath);
      }

      if (nextExpandedPaths.size !== this.expandedPaths.size) {
        this.expandedPaths = nextExpandedPaths;
        this.saveUISettings({ expandedPaths: [...nextExpandedPaths] });
      }
    }

    this.persistState();
  }

  toggleExpanded(nodePath: string): void {
    const next = new Set(this.expandedPaths);
    if (next.has(nodePath)) {
      next.delete(nodePath);
    } else {
      next.add(nodePath);
    }
    this.expandedPaths = next;
    this.saveUISettings({ expandedPaths: [...next] });
  }

  expandAll(): void {
    const allFolderPaths = new Set<string>();
    const collectPaths = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'folder') {
          allFolderPaths.add(node.path);
          if (node.children) {
            collectPaths(node.children);
          }
        }
      }
    };
    collectPaths(this.tree);
    this.expandedPaths = allFolderPaths;
    this.saveUISettings({ expandedPaths: [...allFolderPaths] });
  }

  collapseAll(): void {
    this.expandedPaths = new Set();
    this.saveUISettings({ expandedPaths: [] });
  }

  get vaultPath(): string | null {
    return this.path;
  }

  async createNote(parentPath: string, name: string, content?: string): Promise<string> {
    const fullPath = `${parentPath}/${name}`;
    await vault.writeNote(this.path!, fullPath, content ?? `# ${name}\n\n`);
    await this.refreshTree();
    return fullPath;
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
