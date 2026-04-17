export interface Vault {
  open(path: string): Promise<{ path: string; files: number }>;
  readNote(path: string): Promise<{ path: string; content: string; frontmatter: Record<string, unknown> }>;
  writeNote(path: string, content: string): Promise<void>;
  deleteNote(path: string): Promise<void>;
  listFiles(): Promise<string[]>;
  createFolder(path: string): Promise<void>;
}

export const vault: Vault = {
  async open(path: string) {
    // TODO: IPC call - window.electronAPI.vault.open(path)
    return { path, files: 0 };
  },
  async readNote(path: string) {
    // TODO: IPC call - window.electronAPI.vault.read(path)
    return { path, content: '', frontmatter: {} };
  },
  async writeNote(path: string, content: string) {
    // TODO: IPC call - window.electronAPI.vault.write(path, content)
  },
  async deleteNote(path: string) {
    // TODO: IPC call - window.electronAPI.vault.delete(path)
  },
  async listFiles() {
    // TODO: IPC call - window.electronAPI.vault.list()
    return [];
  },
  async createFolder(path: string) {
    // TODO: IPC call - window.electronAPI.vault.createFolder(path)
  },
};
