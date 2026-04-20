import type { ImageStorageConfig } from '@/types/image-storage';

export interface ImageStorageAPI {
  upload(data: { arrayBuffer: ArrayBuffer; mimeType: string; vaultPath: string }): Promise<string>;
  getConfig(vaultPath: string): Promise<ImageStorageConfig | null>;
  setConfig(vaultPath: string, config: ImageStorageConfig): Promise<void>;
}

export const imageStorage: ImageStorageAPI = {
  async upload(data: {
    arrayBuffer: ArrayBuffer;
    mimeType: string;
    vaultPath: string;
  }): Promise<string> {
    const result = await window.electronAPI!.imageStorage.upload(data);
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }
    if (result.url === undefined) {
      throw new Error(result.error || 'Upload failed');
    }
    return result.url;
  },

  async getConfig(vaultPath: string): Promise<ImageStorageConfig | null> {
    const result = await window.electronAPI!.imageStorage.getConfig(vaultPath);
    if (!result.success) {
      return null;
    }
    return result.config as ImageStorageConfig;
  },

  async setConfig(vaultPath: string, config: ImageStorageConfig): Promise<void> {
    const result = await window.electronAPI!.imageStorage.setConfig(vaultPath, config);
    if (!result.success) {
      throw new Error(result.error || 'Failed to save config');
    }
  },
};
