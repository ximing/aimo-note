import type { ClipboardImageData } from '@/types/image-storage';

export interface ClipboardAPI {
  readImage(): Promise<ClipboardImageData | null>;
}

export const clipboard: ClipboardAPI = {
  async readImage(): Promise<ClipboardImageData | null> {
    const result = await window.electronAPI!.clipboard.readImage();
    if (!result.success || !result.data) {
      console.error('Clipboard read failed:', result.error);
      return null;
    }
    return {
      arrayBuffer: result.data.arrayBuffer,
      mimeType: result.data.mimeType,
    };
  },
};
