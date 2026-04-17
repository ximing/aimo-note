import { Service, resolve } from '@rabjs/react';
import { vault } from '@/ipc/vault';
import type { TreeNode } from '@/ipc/vault';

export class VaultService extends Service {
  path: string | null = null;
  tree: TreeNode[] = [];
  activeFile: string | null = null;
  isLoading = false;

  async openVault(path: string): Promise<void> {
    this.isLoading = true;
    try {
      const result = await vault.open(path);
      if (result) {
        this.path = result.path;
        await this.refreshTree();
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
