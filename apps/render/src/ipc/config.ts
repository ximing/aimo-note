export interface RecentVault {
  path: string;
  name: string;
  lastOpened: number;
}

export interface Config {
  getRecentVaults(): Promise<RecentVault[]>;
  addRecentVault(vaultPath: string): Promise<RecentVault[]>;
  removeRecentVault(vaultPath: string): Promise<RecentVault[]>;
}

export const config: Config = {
  async getRecentVaults() {
    return await window.electronAPI!.config.getRecentVaults();
  },
  async addRecentVault(vaultPath: string) {
    const result = await window.electronAPI!.config.addRecentVault(vaultPath);
    return result.recentVaults;
  },
  async removeRecentVault(vaultPath: string) {
    const result = await window.electronAPI!.config.removeRecentVault(vaultPath);
    return result.recentVaults;
  },
};
