import type { ClipboardImageData } from '@/types/image-storage';

export interface ClipboardAPI {
  readImage(): Promise<ClipboardImageData | null>;
}

export const clipboard: ClipboardAPI = {
  async readImage(): Promise<ClipboardImageData | null> {
    const result = await window.electronAPI!.clipboard.readImage();
    if (!result.success || !result.data) {
      return null;
    }
    return {
      arrayBuffer: result.data.arrayBuffer,
      mimeType: result.data.mimeType,
    };
  },
};
