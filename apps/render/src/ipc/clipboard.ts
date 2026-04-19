import type { ClipboardImageData } from '@/types/image-storage';

export interface ClipboardAPI {
  readImage(): Promise<ClipboardImageData | null>;
  writeText(text: string): Promise<void>;
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
  async writeText(text: string): Promise<void> {
    const result = await window.electronAPI!.clipboard.writeText(text);
    if (!result.success) {
      console.error('Clipboard write failed:', result.error);
    }
  },
};
