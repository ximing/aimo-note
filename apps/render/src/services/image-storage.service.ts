import { Service, resolve } from '@rabjs/react';
import { clipboard } from '@/ipc/clipboard';
import { imageStorage } from '@/ipc/image-storage';
import { VaultService } from './vault.service';
import type { ImageStorageConfig } from '@/types/image-storage';

const DEFAULT_CONFIG: ImageStorageConfig = {
  type: 'local',
  local: { path: 'assets/images' },
};

export class ImageStorageService extends Service {
  private _config: ImageStorageConfig = DEFAULT_CONFIG;

  get config(): ImageStorageConfig {
    return this._config;
  }

  private get vaultService(): VaultService | null {
    return this.resolve(VaultService);
  }

  async loadConfig(): Promise<ImageStorageConfig> {
    const vaultPath = this.vaultService?.path;
    if (!vaultPath) {
      this._config = DEFAULT_CONFIG;
      return this._config;
    }

    try {
      const config = await imageStorage.getConfig(vaultPath);
      this._config = config || DEFAULT_CONFIG;
      return this._config;
    } catch (error) {
      console.error('[ImageStorageService] Failed to load config:', error);
      this._config = DEFAULT_CONFIG;
      return this._config;
    }
  }

  async saveConfig(config: ImageStorageConfig): Promise<void> {
    const vaultPath = this.vaultService?.path;
    if (!vaultPath) {
      throw new Error('No vault open');
    }

    await imageStorage.setConfig(vaultPath, config);
    this._config = config;
  }

  async uploadFromClipboard(): Promise<string | null> {
    const vaultPath = this.vaultService?.path;
    if (!vaultPath) {
      throw new Error('No vault open');
    }

    // Read image from clipboard
    const imageData = await clipboard.readImage();
    if (!imageData) {
      return null;  // No image in clipboard
    }

    // Upload
    const url = await imageStorage.upload({
      arrayBuffer: imageData.arrayBuffer,
      mimeType: imageData.mimeType,
      vaultPath,
    });

    return url;
  }

  async upload(arrayBuffer: ArrayBuffer, mimeType: string): Promise<string> {
    const vaultPath = this.vaultService?.path;
    if (!vaultPath) {
      throw new Error('No vault open');
    }
    return await imageStorage.upload({
      arrayBuffer,
      mimeType,
      vaultPath,
    });
  }
}

export function useImageStorageService(): ImageStorageService {
  return resolve(ImageStorageService);
}
