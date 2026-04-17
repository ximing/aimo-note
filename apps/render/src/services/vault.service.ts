import { Service, resolve } from '@rabjs/react';
import { vault } from '@/ipc/vault';
import { config } from '@/ipc/config';
import type { TreeNode } from '@/ipc/vault';
import type { RecentVault } from '@/ipc/config';

export class VaultService extends Service {
  path: string | null = null;
  tree: TreeNode[] = [];
  activeFile: string | null = null;
  isLoading = false;
  recentVaults: RecentVault[] = [];

  async loadRecentVaults(): Promise<void> {
    this.recentVaults = await config.getRecentVaults();
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

  setActiveFile(path: string | null): void {
    this.activeFile = path;
  }

  get vaultPath(): string | null {
    return this.path;
  }

  async createNote(parentPath: string, name: string): Promise<void> {
    const fullPath = `${parentPath}/${name}`;
    await vault.writeNote(fullPath, `# ${name}\n\n`);
    await this.refreshTree();
  }

  async createFolder(parentPath: string, name: string): Promise<void> {
    const fullPath = `${parentPath}/${name}`;
    await vault.createFolder(fullPath);
    await this.refreshTree();
  }

  async renameNode(node: TreeNode, newName: string): Promise<void> {
    const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
    const newPath = `${parentPath}/${newName}`;
    await vault.rename(node.path, newPath);
    await this.refreshTree();
  }

  async deleteNode(node: TreeNode): Promise<void> {
    await vault.deleteNote(node.path);
    await this.refreshTree();
  }
}

export function useVaultService(): VaultService {
  return resolve(VaultService);
}
