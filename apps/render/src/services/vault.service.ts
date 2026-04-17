import { Service } from '@rabjs/react';
import { vault } from '@/ipc/vault';
import type { TreeNode } from '@/ipc/vault';

export interface VaultState {
  path: string | null;
  tree: TreeNode[];
  activeFile: string | null;
  isLoading: boolean;
}

class VaultService extends Service<VaultState> {
  protected state: VaultState = {
    path: null,
    tree: [],
    activeFile: null,
    isLoading: false,
  };

  async openVault(path: string): Promise<void> {
    this.state.isLoading = true;
    this.notify();
    try {
      const result = await vault.open(path);
      if (result) {
        this.state.path = result.path;
        await this.refreshTree();
      }
    } finally {
      this.state.isLoading = false;
      this.notify();
    }
  }

  async refreshTree(): Promise<void> {
    if (!this.state.path) return;
    const tree = await vault.list(this.state.path);
    this.state.tree = tree;
    this.notify();
  }

  async selectAndOpenVault(): Promise<boolean> {
    const path = await vault.selectFolder();
    if (path) {
      await this.openVault(path);
      return true;
    }
    return false;
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

  setActiveFile(path: string | null): void {
    this.state.activeFile = path;
    this.notify();
  }

  get vaultPath(): string | null {
    return this.state.path;
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

export const vaultService = new VaultService();
export function useVaultService() {
  return vaultService.use();
}
