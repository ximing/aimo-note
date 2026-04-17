export interface Window {
  minimize(): void;
  maximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  setAlwaysOnTop(flag: boolean): void;
}

export const window: Window = {
  minimize() {
    // TODO: IPC call - window.electronAPI.window.minimize()
  },
  maximize() {
    // TODO: IPC call - window.electronAPI.window.maximize()
  },
  close() {
    // TODO: IPC call - window.electronAPI.window.close()
  },
  async isMaximized() {
    // TODO: IPC call - window.electronAPI.window.isMaximized()
    return false;
  },
  setAlwaysOnTop(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _flag: boolean) {
    // TODO: IPC call - window.electronAPI.window.setAlwaysOnTop(flag)
  },
};
