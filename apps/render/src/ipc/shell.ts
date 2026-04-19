export interface ShellAPI {
  openPath(path: string): Promise<void>;
}

export const shell: ShellAPI = {
  async openPath(filePath: string): Promise<void> {
    const result = await window.electronAPI!.shell.openPath(filePath);
    if (!result.success) {
      console.error('Failed to open path:', result.error);
    }
  },
};
