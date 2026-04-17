export interface TreeNode {
  path: string;
  name: string;
  isDirectory: boolean;
  children?: TreeNode[];
}

export interface Vault {
  open(path: string): Promise<{ path: string; files: number }>;
  readNote(path: string): Promise<{ path: string; content: string; frontmatter: Record<string, unknown> }>;
  writeNote(path: string, content: string): Promise<void>;
  deleteNote(path: string): Promise<void>;
  list(path: string): Promise<TreeNode[]>;
  selectFolder(): Promise<string | null>;
  create(path: string): Promise<void>;
}

export const vault: Vault = {
  async open(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _path: string) {
    // TODO: IPC call - window.electronAPI.vault.open(path)
    return { path: '', files: 0 };
  },
  async readNote(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _path: string) {
    // TODO: IPC call - window.electronAPI.vault.read(path)
    return { path: '', content: '', frontmatter: {} };
  },
  async writeNote(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _path: string, // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _content: string) {
    // TODO: IPC call - window.electronAPI.vault.write(path, content)
  },
  async deleteNote(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _path: string) {
    // TODO: IPC call - window.electronAPI.vault.delete(path)
  },
  async list(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _path: string) {
    // TODO: IPC call - window.electronAPI.vault.list(path)
    return [];
  },
  async selectFolder() {
    // TODO: IPC call - window.electronAPI.vault.selectFolder()
    return null;
  },
  async create(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _path: string) {
    // TODO: IPC call - window.electronAPI.vault.create(path)
  },
};
