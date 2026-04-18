export interface TreeNode {
  path: string;
  name: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

export interface Vault {
  open(path: string): Promise<{ path: string; tree: TreeNode[] }>;
  readNote(vaultPath: string, path: string): Promise<{ path: string; content: string }>;
  writeNote(vaultPath: string, path: string, content: string): Promise<void>;
  deleteNote(vaultPath: string, path: string): Promise<void>;
  list(path: string): Promise<TreeNode[]>;
  selectFolder(): Promise<string | null>;
  create(path: string): Promise<void>;
  createFolder(vaultPath: string, path: string): Promise<void>;
  rename(vaultPath: string, oldPath: string, newPath: string): Promise<void>;
}

export const vault: Vault = {
  async open(path: string) {
    const result = await window.electronAPI!.vault.open(path);
    if (!result.success) {
      throw new Error(result.error);
    }
    return { path, tree: result.tree || [] };
  },
  async readNote(vaultPath: string, filePath: string) {
    const result = await window.electronAPI!.vault.readNote(vaultPath, filePath);
    if (!result.success) {
      throw new Error(result.error);
    }
    return { path: filePath, content: result.content || '' };
  },
  async writeNote(vaultPath: string, filePath: string, content: string) {
    console.log('[IPC Client] vault.writeNote called', {
      vaultPath: `'${vaultPath}'`,
      filePath: `'${filePath}'`,
      contentLength: content.length,
      contentPreview: content.substring(0, 50)
    });
    const result = await window.electronAPI!.vault.writeNote(vaultPath, filePath, content);
    console.log('[IPC Client] vault.writeNote result:', result);
    if (!result.success) {
      throw new Error(result.error);
    }
  },
  async deleteNote(vaultPath: string, filePath: string) {
    const result = await window.electronAPI!.vault.delete(vaultPath, filePath);
    if (!result.success) {
      throw new Error(result.error);
    }
  },
  async list(path: string) {
    const result = await window.electronAPI!.vault.list(path);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.tree || [];
  },
  async selectFolder() {
    const result = await window.electronAPI!.vault.selectFolder();
    if (!result.success) {
      return null;
    }
    return result.path || null;
  },
  async create(path: string) {
    const result = await window.electronAPI!.vault.create(path);
    if (!result.success) {
      throw new Error(result.error);
    }
  },
  async createFolder(vaultPath: string, folderPath: string) {
    const result = await window.electronAPI!.vault.createFolder(vaultPath, folderPath);
    if (!result.success) {
      throw new Error(result.error);
    }
  },
  async rename(vaultPath: string, oldPath: string, newPath: string) {
    const result = await window.electronAPI!.vault.rename(vaultPath, oldPath, newPath);
    if (!result.success) {
      throw new Error(result.error);
    }
  },
};
