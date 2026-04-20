# Image Storage Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable pasting images into the editor, storing them locally or on S3 based on vault configuration.

**Architecture:** Add clipboard reading IPC to extract images from clipboard, new IPC handlers for image storage (local/S3), ImageStorageService in renderer to orchestrate uploads, and Settings UI to configure storage options.

**Tech Stack:** Electron IPC, @aws-sdk/client-s3, @rabjs/react Service pattern, Milkdown editor

---

## Chunk 1: Types & IPC Bridge (renderer side)

**Files:**

- Create: `apps/render/src/ipc/clipboard.ts` — IPC wrapper for clipboard operations
- Create: `apps/render/src/ipc/image-storage.ts` — IPC wrapper for image storage operations
- Modify: `apps/render/src/ipc/index.ts` — export new modules
- Create: `apps/render/src/types/image-storage.ts` — shared TypeScript types

### Task 1: Define image storage types

- [ ] **Step 1: Create type definitions**

```typescript
// apps/render/src/types/image-storage.ts
export type ImageStorageType = 'local' | 's3';

export interface LocalImageStorageConfig {
  type: 'local';
  local: {
    path: string; // default: 'assets/images'
  };
}

export interface S3ImageStorageConfig {
  type: 's3';
  s3: {
    accessKey: string;
    secretKey: string;
    bucket: string;
    region: string;
    endpoint: string; // optional
    keyPrefix: string; // optional, default ''
  };
}

export type ImageStorageConfig = LocalImageStorageConfig | S3ImageStorageConfig;

export interface ClipboardImageData {
  arrayBuffer: ArrayBuffer;
  mimeType: string;
}

export interface ImageStorageUploadResult {
  url: string; // relative path for local, full URL for S3
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/render/src/types/image-storage.ts
git commit -m "feat(types): add image storage TypeScript types"
```

### Task 2: Create clipboard IPC wrapper

- [ ] **Step 1: Create clipboard IPC wrapper**

```typescript
// apps/render/src/ipc/clipboard.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/render/src/ipc/clipboard.ts
git commit -m "feat(ipc): add clipboard IPC wrapper"
```

### Task 3: Create image-storage IPC wrapper

- [ ] **Step 1: Create image-storage IPC wrapper**

```typescript
// apps/render/src/ipc/image-storage.ts
import type { ImageStorageConfig, ImageStorageUploadResult } from '@/types/image-storage';

export interface ImageStorageAPI {
  upload(data: { arrayBuffer: ArrayBuffer; mimeType: string }): Promise<string>;
  getConfig(): Promise<ImageStorageConfig | null>;
  setConfig(config: ImageStorageConfig): Promise<void>;
}

export const imageStorage: ImageStorageAPI = {
  async upload(data: { arrayBuffer: ArrayBuffer; mimeType: string }): Promise<string> {
    const result = await window.electronAPI!.imageStorage.upload({
      arrayBuffer: data.arrayBuffer,
      mimeType: data.mimeType,
    });
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }
    return result.url;
  },

  async getConfig(): Promise<ImageStorageConfig | null> {
    const result = await window.electronAPI!.imageStorage.getConfig();
    if (!result.success) {
      return null;
    }
    return result.config as ImageStorageConfig;
  },

  async setConfig(config: ImageStorageConfig): Promise<void> {
    const result = await window.electronAPI!.imageStorage.setConfig(config);
    if (!result.success) {
      throw new Error(result.error || 'Failed to save config');
    }
  },
};
```

- [ ] **Step 2: Update IPC index to export new modules**

Modify `apps/render/src/ipc/index.ts` to add:

```typescript
export { clipboard } from './clipboard';
export { imageStorage } from './image-storage';
```

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/ipc/image-storage.ts apps/render/src/ipc/index.ts
git commit -m "feat(ipc): add image-storage IPC wrapper"
```

---

## Chunk 2: Main Process IPC Handlers

**Files:**

- Modify: `apps/client/src/preload/index.ts` — add clipboard and imageStorage APIs
- Modify: `apps/client/src/main/ipc/handlers.ts` — add clipboard:read-image and image-storage:\* handlers

### Task 4: Add preload APIs

- [ ] **Step 1: Add clipboard.readImage and imageStorage APIs to preload**

Add to `contextBridge.exposeInMainWorld('electronAPI', { ... })` in `apps/client/src/preload/index.ts`:

```typescript
// Add clipboard namespace
clipboard: {
  readImage: () => ipcRenderer.invoke('clipboard:read-image'),
},

// Add imageStorage namespace
imageStorage: {
  upload: (data: { arrayBuffer: ArrayBuffer; mimeType: string }) =>
    ipcRenderer.invoke('image-storage:upload', data),
  getConfig: () => ipcRenderer.invoke('image-storage:get-config'),
  setConfig: (config: ImageStorageConfig) =>
    ipcRenderer.invoke('image-storage:set-config', config),
},
```

Add `ImageStorageConfig` import at top of file (type only, runtime only uses structure).

- [ ] **Step 2: Update Window type declaration**

Add to the `Window` interface declaration in the same file:

```typescript
clipboard: {
  readImage: () =>
    Promise<{
      success: boolean;
      data?: { arrayBuffer: ArrayBuffer; mimeType: string };
      error?: string;
    }>;
}

imageStorage: {
  upload: (data: { arrayBuffer: ArrayBuffer; mimeType: string }) =>
    Promise<{
      success: boolean;
      url?: string;
      error?: string;
    }>;
  getConfig: () =>
    Promise<{
      success: boolean;
      config?: ImageStorageConfig;
      error?: string;
    }>;
  setConfig: (config: ImageStorageConfig) =>
    Promise<{
      success: boolean;
      error?: string;
    }>;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/preload/index.ts
git commit -m "feat(preload): add clipboard and imageStorage APIs"
```

### Task 5: Add clipboard:read-image handler

- [ ] **Step 1: Add clipboard read handler to handlers.ts**

Add import at top:

```typescript
import { clipboard } from 'electron';
```

Add new handler in `registerIpcHandlers()`:

```typescript
// Clipboard handlers - read image from clipboard
ipcMain.handle('clipboard:read-image', async () => {
  try {
    const image = await clipboard.readImage();
    if (image.isEmpty()) {
      return { success: true, data: null };
    }

    const buffer = image.toPNG();
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );

    return {
      success: true,
      data: {
        arrayBuffer,
        mimeType: 'image/png',
      },
    };
  } catch (error) {
    console.error('[IPC] clipboard:read-image error:', error);
    return { success: false, error: String(error), data: null };
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/main/ipc/handlers.ts
git commit -m "feat(ipc): add clipboard:read-image handler"
```

### Task 6: Add image-storage handlers (local upload)

- [ ] **Step 1: Add image-storage:upload handler to handlers.ts**

Add import at top:

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import { randomUUID } from 'crypto';
```

Add to `registerIpcHandlers()`:

```typescript
// Image storage handlers
ipcMain.handle(
  'image-storage:upload',
  async (event, data: { arrayBuffer: ArrayBuffer; mimeType: string }) => {
    try {
      const vaultPath = event.senderFrame?.webContents?.getOwnerBrowserWindow()?.getTitle();
      // Actually we need to pass vaultPath from renderer - update to accept it
      // For now, we'll need to pass it explicitly
      return { success: false, error: 'Vault path not provided' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
);

ipcMain.handle('image-storage:get-config', async (event, vaultPath: string) => {
  try {
    const configPath = path.join(vaultPath, '.aimo-note/config.json');
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    return { success: true, config: config.imageStorage || null };
  } catch (error) {
    // Config doesn't exist yet, return default
    return {
      success: true,
      config: { type: 'local', local: { path: 'assets/images' } },
    };
  }
});

ipcMain.handle(
  'image-storage:set-config',
  async (event, vaultPath: string, config: ImageStorageConfig) => {
    try {
      const configPath = path.join(vaultPath, '.aimo-note/config.json');
      let existingConfig: Record<string, unknown> = {};
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        existingConfig = JSON.parse(content);
      } catch {
        // File doesn't exist, will be created
      }
      existingConfig.imageStorage = config;
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('[IPC] image-storage:set-config error:', error);
      return { success: false, error: String(error) };
    }
  }
);
```

**Correction**: The upload handler needs `vaultPath` passed from renderer. Update the preload API to include vaultPath.

- [ ] **Step 2: Fix preload API to include vaultPath**

Update preload `imageStorage.upload` to:

```typescript
upload: (data: { arrayBuffer: ArrayBuffer; mimeType: string; vaultPath: string }) =>
  ipcRenderer.invoke('image-storage:upload', data),
```

Update renderer IPC wrapper accordingly.

- [ ] **Step 3: Implement the actual local upload logic**

Replace the stub handler with:

```typescript
ipcMain.handle(
  'image-storage:upload',
  async (event, data: { arrayBuffer: ArrayBuffer; mimeType: string; vaultPath: string }) => {
    const { arrayBuffer, mimeType, vaultPath } = data;

    try {
      // Get image storage config
      const configPath = path.join(vaultPath, '.aimo-note/config.json');
      let config: ImageStorageConfig;
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        config = parsed.imageStorage || { type: 'local', local: { path: 'assets/images' } };
      } catch {
        config = { type: 'local', local: { path: 'assets/images' } };
      }

      if (config.type === 's3') {
        // S3 upload handled separately below
        return { success: false, error: 'S3 not implemented in this handler' };
      }

      // Local storage
      const { local } = config;
      const uuid = randomUUID();
      const ext = mimeType.split('/')[1] || 'png';
      const fileName = `${uuid}.${ext}`;
      const relativePath = path.join(local.path, fileName);
      const fullPath = path.join(vaultPath, relativePath);

      // Validate path is within vault (prevent path traversal)
      const normalizedFull = path.normalize(fullPath);
      const normalizedVault = path.normalize(vaultPath);
      if (!normalizedFull.startsWith(normalizedVault)) {
        return { success: false, error: 'Invalid path: traversal detected' };
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      // Write file
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(fullPath, buffer);

      // Return relative path as URL
      return { success: true, url: relativePath.replace(/\\/g, '/') };
    } catch (error) {
      console.error('[IPC] image-storage:upload error:', error);
      return { success: false, error: String(error) };
    }
  }
);
```

- [ ] **Step 4: Add S3 upload logic**

Add after the local storage block:

```typescript
if (config.type === 's3') {
  const { s3 } = config;
  const uuid = randomUUID();
  const ext = mimeType.split('/')[1] || 'png';
  const key = `${s3.keyPrefix || ''}${uuid}.${ext}`;

  const s3Client = new S3Client({
    region: s3.region,
    credentials: {
      accessKeyId: s3.accessKey,
      secretAccessKey: s3.secretKey,
    },
    ...(s3.endpoint ? { endpoint: s3.endpoint, forcePathStyle: true } : {}),
  });

  const command = new PutObjectCommand({
    Bucket: s3.bucket,
    Key: key,
    Body: Buffer.from(arrayBuffer),
    ContentType: mimeType,
  });

  await s3Client.send(command);

  const url = s3.endpoint
    ? `${s3.endpoint}/${s3.bucket}/${key}`
    : `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/${key}`;

  return { success: true, url };
}
```

- [ ] **Step 5: Update preload handler signatures to match**

Update preload `imageStorage.upload` signature:

```typescript
upload: (data: { arrayBuffer: ArrayBuffer; mimeType: string; vaultPath: string }) =>
  ipcRenderer.invoke('image-storage:upload', data),
```

- [ ] **Step 6: Update renderer IPC wrapper**

Update `apps/render/src/ipc/image-storage.ts`:

```typescript
async upload(data: { arrayBuffer: ArrayBuffer; mimeType: string; vaultPath: string }): Promise<string>
```

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/main/ipc/handlers.ts apps/client/src/preload/index.ts apps/render/src/ipc/image-storage.ts
git commit -m "feat(ipc): add image-storage handlers with local and S3 upload support"
```

---

## Chunk 3: ImageStorageService

**Files:**

- Create: `apps/render/src/services/image-storage.service.ts` — main service

### Task 7: Create ImageStorageService

- [ ] **Step 1: Create the service**

```typescript
// apps/render/src/services/image-storage.service.ts
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
      const config = await imageStorage.getConfig();
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

    await imageStorage.setConfig(config);
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
      return null; // No image in clipboard
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
```

- [ ] **Step 2: Register service in main.tsx**

Add to service registration in `apps/render/src/main.tsx`:

```typescript
import { ImageStorageService } from './services/image-storage.service';

register(ImageStorageService);
```

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/services/image-storage.service.ts apps/render/src/main.tsx
git commit -m "feat(service): add ImageStorageService"
```

---

## Chunk 4: Settings UI

**Files:**

- Modify: `apps/render/src/pages/settings/index.tsx` — add Image Storage section

### Task 8: Add Image Storage settings section

- [ ] **Step 1: Read current settings page**

```bash
cat apps/render/src/pages/settings/index.tsx
```

- [ ] **Step 2: Add ImageStorageService to settings page**

Update imports and component:

```typescript
import { observer } from '@rabjs/react';
import { useImageStorageService } from '../../services/image-storage.service';
import type { ImageStorageConfig, LocalImageStorageConfig, S3ImageStorageConfig } from '../../types/image-storage';

export const SettingsPage = observer(() => {
  const imageStorageService = useImageStorageService();
  // ... existing code ...

  const handleStorageTypeChange = (type: 'local' | 's3') => {
    const newConfig: ImageStorageConfig = type === 'local'
      ? { type: 'local', local: { path: 'assets/images' } }
      : { type: 's3', s3: { accessKey: '', secretKey: '', bucket: '', region: 'us-east-1', endpoint: '', keyPrefix: '' } };
    imageStorageService.saveConfig(newConfig);
  };

  const handleLocalPathChange = (path: string) => {
    if (imageStorageService.config.type !== 'local') return;
    imageStorageService.saveConfig({ type: 'local', local: { path } });
  };

  const handleS3FieldChange = (field: string, value: string) => {
    if (imageStorageService.config.type !== 's3') return;
    const currentS3 = imageStorageService.config.s3;
    imageStorageService.saveConfig({
      type: 's3',
      s3: { ...currentS3, [field]: value },
    });
  };
```

- [ ] **Step 3: Add Image Storage section to JSX**

Add after the Appearance section:

```tsx
<section className="settings-section mb-8">
  <h2 className="text-lg font-semibold mb-4 text-text-primary">Image Storage</h2>

  {/* Storage Type */}
  <div className="mb-4">
    <label className="block text-sm font-medium mb-2 text-text-secondary">Storage Type</label>
    <div className="flex gap-4">
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="storageType"
          checked={imageStorageService.config.type === 'local'}
          onChange={() => handleStorageTypeChange('local')}
        />
        <span>Local</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="storageType"
          checked={imageStorageService.config.type === 's3'}
          onChange={() => handleStorageTypeChange('s3')}
        />
        <span>S3</span>
      </label>
    </div>
  </div>

  {/* Local Path */}
  {imageStorageService.config.type === 'local' && (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2 text-text-secondary">Local Path</label>
      <input
        type="text"
        value={imageStorageService.config.local.path}
        onChange={(e) => handleLocalPathChange(e.target.value)}
        placeholder="assets/images"
        className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
      />
    </div>
  )}

  {/* S3 Config */}
  {imageStorageService.config.type === 's3' && (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2 text-text-secondary">Access Key</label>
        <input
          type="text"
          value={imageStorageService.config.s3.accessKey}
          onChange={(e) => handleS3FieldChange('accessKey', e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2 text-text-secondary">Secret Key</label>
        <input
          type="password"
          value={imageStorageService.config.s3.secretKey}
          onChange={(e) => handleS3FieldChange('secretKey', e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2 text-text-secondary">Bucket</label>
        <input
          type="text"
          value={imageStorageService.config.s3.bucket}
          onChange={(e) => handleS3FieldChange('bucket', e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2 text-text-secondary">Region</label>
        <input
          type="text"
          value={imageStorageService.config.s3.region}
          onChange={(e) => handleS3FieldChange('region', e.target.value)}
          placeholder="us-east-1"
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2 text-text-secondary">
          Endpoint (optional)
        </label>
        <input
          type="text"
          value={imageStorageService.config.s3.endpoint}
          onChange={(e) => handleS3FieldChange('endpoint', e.target.value)}
          placeholder="https://s3.example.com"
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-2 text-text-secondary">Key Prefix</label>
        <input
          type="text"
          value={imageStorageService.config.s3.keyPrefix}
          onChange={(e) => handleS3FieldChange('keyPrefix', e.target.value)}
          placeholder="2026/04/"
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
        />
      </div>
    </div>
  )}
</section>
```

- [ ] **Step 4: Commit**

```bash
git add apps/render/src/pages/settings/index.tsx
git commit -m "feat(settings): add image storage configuration section"
```

---

## Chunk 5: Editor Integration

**Files:**

- Modify: `apps/render/src/components/editor/MilkdownEditorInner.tsx` — integrate paste handling

### Task 9: Integrate paste handling with Milkdown

- [ ] **Step 1: Read MilkdownEditorInner to understand current structure**

```bash
cat apps/render/src/components/editor/MilkdownEditorInner.tsx
```

- [ ] **Step 2: Add paste handler**

Add to imports:

```typescript
import { useImageStorageService } from '../../services/image-storage.service';
```

Add inside the component:

```typescript
const imageStorageService = useImageStorageService();

const handlePaste = async (event: ClipboardEvent) => {
  // Check if clipboard has image data
  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault(); // Prevent default paste

      try {
        const url = await imageStorageService.uploadFromClipboard();
        if (url) {
          // Insert image markdown at cursor
          const imageMarkdown = `![${url}](${url})`;
          // Use editor API to insert at cursor position
          editor.action((ctx: unknown) => {
            const { state, dispatch } = ctx;
            const text = state.doc.textBetween(state.selection.from, state.selection.to, '');
            const tr = state.tr.insertText(imageMarkdown, state.selection.from);
            dispatch(tr);
          });
        }
      } catch (error) {
        console.error('[Editor] Image paste failed:', error);
        // Could show toast notification here
      }
      return;
    }
  }
};
```

Add `onPaste={handlePaste}` to the editor container div.

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/components/editor/MilkdownEditorInner.tsx
git commit -m "feat(editor): integrate image paste handling with Milkdown"
```

---

## Chunk 6: Testing & Verification

### Task 10: Test local storage flow

- [ ] **Step 1: Run the app and open a vault**

```bash
pnpm dev
```

- [ ] **Step 2: Paste an image from clipboard**

Expected: Image file created in `assets/images/{uuid}.{ext}` and markdown `![url](url)` inserted at cursor.

- [ ] **Step 3: Verify file exists**

Check the vault directory for the created image file.

### Task 11: Test settings UI

- [ ] **Step 1: Open settings page**

- [ ] **Step 2: Change storage type to S3**

Expected: S3 configuration fields appear.

- [ ] **Step 3: Fill S3 credentials and save**

Expected: Config saved to `.aimo-note/config.json`.

---

## Dependencies

Before implementing, install the AWS SDK:

```bash
pnpm add @aws-sdk/client-s3
```
