export interface FS {
  selectVault(): Promise<string | null>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export const fs: FS = {
  async selectVault() {
    // TODO: IPC call - window.electronAPI.fs.selectVault()
    return null;
  },
  async readFile(path: string) {
    // TODO: IPC call - window.electronAPI.fs.readFile(path)
    return '';
  },
  async writeFile(path: string, content: string) {
    // TODO: IPC call - window.electronAPI.fs.writeFile(path, content)
  },
  async exists(path: string) {
    // TODO: IPC call - window.electronAPI.fs.exists(path)
    return false;
  },
};
