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
  async readFile(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _path: string) {
    // TODO: IPC call - window.electronAPI.fs.readFile(path)
    return '';
  },
  async writeFile(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _path: string, // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _content: string) {
    // TODO: IPC call - window.electronAPI.fs.writeFile(path, content)
  },
  async exists(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _path: string) {
    // TODO: IPC call - window.electronAPI.fs.exists(path)
    return false;
  },
};
