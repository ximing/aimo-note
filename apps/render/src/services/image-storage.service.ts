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
  private _isLoading = false;

  get config(): ImageStorageConfig {
    return this._config;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  private get vaultService(): VaultService | null {
    return this.resolve(VaultService);
  }

  async loadConfig(): Promise<void> {
    const vaultPath = this.vaultService?.path;
    if (!vaultPath) {
      this._config = DEFAULT_CONFIG;
      return;
    }

    this._isLoading = true;
    try {
      const config = await imageStorage.getConfig(vaultPath);
      this._config = config || DEFAULT_CONFIG;
    } catch {
      this._config = DEFAULT_CONFIG;
    } finally {
      this._isLoading = false;
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
}

export function useImageStorageService(): ImageStorageService {
  return resolve(ImageStorageService);
}
