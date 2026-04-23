import { app, ipcMain, safeStorage, dialog, clipboard, shell } from 'electron';
import Store from 'electron-store';
import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import type { SearchResult, Template, TemplateField, SnapshotRecord, SnapshotRestoreResult } from '@aimo-note/dto';
import matter from 'gray-matter';

const TEMPLATES_DIR = '.aimo-note/templates';
const TEMPLATE_EXT = '.md';

/**
 * High-level wrapper around ripgrep spawn that returns stdout as a Promise.
 * Matches the expected rg.rgFiles(args) API from the implementation spec.
 */
async function rgFiles(args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!rgPath) {
      reject(
        new Error('Ripgrep binary not found. Please ensure @vscode/ripgrep is properly installed.')
      );
      return;
    }

    const proc = spawn(rgPath, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 || code === 1) {
        // 0 = matches found, 1 = no matches
        resolve(stdout);
      } else {
        reject(new Error(stderr || `ripgrep exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

function extractRipgrepPath(pathValue: unknown): string | null {
  if (typeof pathValue === 'string') {
    return pathValue;
  }

  if (pathValue && typeof pathValue === 'object') {
    const candidate = Reflect.get(pathValue, 'text');
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  return null;
}

function toVaultRelativePath(rootPath: string, candidatePath: string): string | null {
  const relativePath = path.relative(rootPath, candidatePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath.split(path.sep).join('/');
}

function utf8ByteOffsetToStringIndex(text: string, byteOffset: number): number {
  if (byteOffset <= 0) {
    return 0;
  }

  let currentByteOffset = 0;
  let stringIndex = 0;

  for (const char of text) {
    const nextByteOffset = currentByteOffset + Buffer.byteLength(char, 'utf8');
    if (nextByteOffset > byteOffset) {
      break;
    }

    currentByteOffset = nextByteOffset;
    stringIndex += char.length;
  }

  return stringIndex;
}

import { checkForUpdates, downloadUpdate, installUpdate } from '../updater';

// Image storage config type (duplicated from render types to avoid cross-package dependency)
type ImageStorageConfig =
  | { type: 'local'; local: { path: string } }
  | {
      type: 's3';
      s3: {
        accessKey: string;
        secretKey: string;
        bucket: string;
        region: string;
        endpoint?: string;
        keyPrefix?: string;
      };
    };

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

async function listDir(vaultPath: string, relativePath: string = ''): Promise<TreeNode[]> {
  const fullPath = path.join(vaultPath, relativePath);
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const entryRelativePath = path.join(relativePath, entry.name);
    const node: TreeNode = {
      name: entry.name,
      path: entryRelativePath,
      type: entry.isDirectory() ? 'folder' : 'file',
    };
    if (entry.isDirectory()) {
      node.children = await listDir(vaultPath, entryRelativePath);
    }
    nodes.push(node);
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}

interface AuthStore {
  encryptedToken: string | null;
}

// Recent vaults store
interface RecentVault {
  path: string;
  name: string;
  lastOpened: number;
}

interface ConfigStore {
  recentVaults: RecentVault[];
}

// Persistent store for encrypted token (survives app restarts)
const authStore = new Store<AuthStore>({
  name: 'auth',
  defaults: { encryptedToken: null },
});

// Config store for app settings (recent vaults, etc.)
const configStore = new Store<ConfigStore>({
  name: 'config',
  defaults: { recentVaults: [] },
});

export function registerIpcHandlers(): void {
  ipcMain.handle('log-preload', (_event, data) => {
    console.log('[Preload] Debug info:', data);
    return { success: true };
  });

  // Secure storage for auth token (uses OS-level encryption + persistent file storage)
  ipcMain.handle('secure-store-set', (_event, { key, value }: { key: string; value: string }) => {
    try {
      if (key === 'auth_token') {
        if (safeStorage.isEncryptionAvailable()) {
          const encrypted = safeStorage.encryptString(value);
          authStore.set('encryptedToken', encrypted.toString('base64'));
          return { success: true };
        } else {
          console.warn('safeStorage encryption not available, using plaintext storage');
          authStore.set('encryptedToken', value);
          return { success: true, warning: 'encryption_not_available' };
        }
      }
      return { success: false, error: 'Unknown key' };
    } catch (error) {
      console.error('Failed to store secure value:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('secure-store-get', (_event, { key }: { key: string }) => {
    try {
      if (key === 'auth_token') {
        const stored = authStore.get('encryptedToken');
        if (!stored) return { success: true, value: null };

        if (safeStorage.isEncryptionAvailable()) {
          const buffer = Buffer.from(stored, 'base64');
          const decrypted = safeStorage.decryptString(buffer);
          return { success: true, value: decrypted };
        } else {
          return { success: true, value: stored };
        }
      }
      return { success: true, value: null };
    } catch (error) {
      console.error('Failed to get secure value:', error);
      return { success: false, error: String(error), value: null };
    }
  });

  ipcMain.handle('secure-store-delete', (_event, { key }: { key: string }) => {
    try {
      if (key === 'auth_token') {
        authStore.set('encryptedToken', null);
        return { success: true };
      }
      return { success: false, error: 'Unknown key' };
    } catch (error) {
      console.error('Failed to delete secure value:', error);
      return { success: false, error: String(error) };
    }
  });

  // Config handlers for recent vaults
  ipcMain.handle('config:getRecentVaults', () => {
    return configStore.get('recentVaults', []);
  });

  ipcMain.handle('config:addRecentVault', (_event, vaultPath: string) => {
    try {
      const recentVaults = configStore.get('recentVaults', []);
      const vaultName = path.basename(vaultPath);

      // Remove if already exists
      const filtered = recentVaults.filter((v: RecentVault) => v.path !== vaultPath);

      // Add to front with new timestamp
      const newVault: RecentVault = {
        path: vaultPath,
        name: vaultName,
        lastOpened: Date.now(),
      };
      filtered.unshift(newVault);

      // Keep only last 10
      const trimmed = filtered.slice(0, 10);
      configStore.set('recentVaults', trimmed);

      return { success: true, recentVaults: trimmed };
    } catch (error) {
      console.error('Failed to add recent vault:', error);
      return { success: false, error: String(error), recentVaults: [] };
    }
  });

  ipcMain.handle('config:removeRecentVault', (_event, vaultPath: string) => {
    try {
      const recentVaults = configStore.get('recentVaults', []);
      const filtered = recentVaults.filter((v: RecentVault) => v.path !== vaultPath);
      configStore.set('recentVaults', filtered);
      return { success: true, recentVaults: filtered };
    } catch (error) {
      console.error('Failed to remove recent vault:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('check-for-updates', async () => {
    return await checkForUpdates();
  });

  ipcMain.handle('download-update', async () => {
    await downloadUpdate();
    return { success: true };
  });

  ipcMain.handle('install-update', () => {
    installUpdate();
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // Vault handlers (core vault operations)
  ipcMain.handle('vault:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle('vault:create', async (_event, vaultPath: string) => {
    await fs.mkdir(vaultPath, { recursive: true });
    return { success: true };
  });

  ipcMain.handle('vault:open', async (_event, vaultPath: string) => {
    try {
      await fs.access(vaultPath);
      const tree = await listDir(vaultPath);
      return { success: true, tree };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('vault:readNote', async (_event, vaultPath: string, filePath: string) => {
    try {
      const fullPath = path.join(vaultPath, filePath);
      const rawContent = await fs.readFile(fullPath, 'utf-8');
      const { data, content: body } = matter(rawContent);
      return { success: true, content: body, frontmatter: data };
    } catch (error) {
      // YAML parse failure: silent ignore per spec — return success:true with empty
      // frontmatter so the document body still loads normally.
      try {
        const fullPath = path.join(vaultPath, filePath);
        const rawContent = await fs.readFile(fullPath, 'utf-8');
        // Strip the --- YAML block so subsequent saves with matter.stringify() produce clean output
        const stripped = rawContent.replace(/^---\n[\s\S]*?\n---\n/, '');
        return { success: true, content: stripped, frontmatter: {} };
      } catch {
        return { success: false, error: String(error) };
      }
    }
  });

  ipcMain.handle(
    'vault:writeNote',
    async (_event, vaultPath: string, filePath: string, content: string) => {
      console.log('[IPC] vault:writeNote called', {
        vaultPath,
        filePath,
        contentLength: content.length,
      });
      try {
        const fullPath = path.join(vaultPath, filePath);
        console.log('[IPC] Writing to fullPath:', fullPath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        return { success: true };
      } catch (error) {
        console.error('[IPC] vault:writeNote error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('vault:delete', async (_event, vaultPath: string, filePath: string) => {
    try {
      const fullPath = path.join(vaultPath, filePath);
      await fs.rm(fullPath, { recursive: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'vault:rename',
    async (_event, vaultPath: string, oldPath: string, newPath: string) => {
      try {
        const fullOldPath = path.join(vaultPath, oldPath);
        const fullNewPath = path.join(vaultPath, newPath);
        await fs.rename(fullOldPath, fullNewPath);
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('vault:createFolder', async (_event, vaultPath: string, folderPath: string) => {
    try {
      const fullPath = path.join(vaultPath, folderPath);
      await fs.mkdir(fullPath, { recursive: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('vault:list', async (_event, vaultPath: string) => {
    try {
      const tree = await listDir(vaultPath);
      return { success: true, tree };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Graph handlers (core graph operations)
  ipcMain.handle('graph:getGraph', async () => {
    console.log('[IPC] graph:getGraph');
    return { nodes: [], edges: [] };
  });

  ipcMain.handle('graph:getBacklinks', async (_event, noteId: string) => {
    console.log('[IPC] graph:getBacklinks', noteId);
    return [];
  });

  ipcMain.handle('graph:getOutlinks', async (_event, noteId: string) => {
    console.log('[IPC] graph:getOutlinks', noteId);
    return [];
  });

  // Search handlers (core search operations)
  ipcMain.handle(
    'search:search',
    async (
      _event,
      options: {
        query: string;
        rootPath: string;
        caseSensitive: boolean;
        isRegex: boolean;
      }
    ) => {
      const { query, rootPath, caseSensitive, isRegex } = options;

      if (!query || !rootPath) {
        return { success: true, results: [] };
      }

      try {
        const args = [
          '--heading',
          '--json',
          '--max-count=10',
          '--glob=!.*', // Skip .* directories
          '--glob=!node_modules',
          query,
          rootPath,
        ];

        if (!caseSensitive) {
          args.push('--ignore-case');
        }

        if (!isRegex) {
          args.push('--fixed-strings');
        }

        // Use high-level rgFiles API from vscode-ripgrep wrapper
        const output = await rgFiles(args);

        const searchResults: SearchResult[] = [];

        for (const line of output.split('\n')) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'match') {
              const resultPath = extractRipgrepPath(parsed.data.path);
              if (!resultPath) {
                continue;
              }

              const relativePath = toVaultRelativePath(rootPath, resultPath);
              if (!relativePath) {
                continue;
              }

              const lineText = parsed.data.lines.text;
              const submatches = parsed.data.submatches || [];
              for (const match of submatches) {
                searchResults.push({
                  path: relativePath,
                  line: parsed.data.line_number,
                  text: lineText,
                  matchedText: extractRipgrepPath(match.match) ?? '',
                  charStart: utf8ByteOffsetToStringIndex(lineText, match.start),
                  charEnd: utf8ByteOffsetToStringIndex(lineText, match.end),
                  byteStart: match.start,
                  byteEnd: match.end,
                });
              }
            }
          } catch {
            // Skip invalid JSON lines
          }
        }

        return { success: true, results: searchResults };
      } catch (error) {
        console.error('[IPC] search:search error:', error);
        return { success: false, error: String(error), results: [] };
      }
    }
  );

  ipcMain.handle('search:searchTitle', async (_event, query, _limit) => {
    console.log('[IPC] search:searchTitle', query);
    return [];
  });

  ipcMain.handle('search:reindex', async () => {
    console.log('[IPC] search:reindex');
    throw new Error('Not implemented');
  });

  // Clipboard handlers
  ipcMain.handle('clipboard:read-image', async () => {
    try {
      const image = clipboard.readImage();
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

  // Image storage handlers
  ipcMain.handle(
    'image-storage:upload',
    async (_event, data: { arrayBuffer: ArrayBuffer; mimeType: string; vaultPath: string }) => {
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

        if (config.type === 'local') {
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

          return { success: true, url: relativePath.replace(/\\/g, '/') };
        } else {
          // S3 storage
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
      } catch (error) {
        console.error('[IPC] image-storage:upload error:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('image-storage:get-config', async (_event, vaultPath: string) => {
    try {
      const configPath = path.join(vaultPath, '.aimo-note/config.json');
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      return { success: true, config: config.imageStorage || null };
    } catch {
      return {
        success: true,
        config: { type: 'local', local: { path: 'assets/images' } },
      };
    }
  });

  ipcMain.handle(
    'image-storage:set-config',
    async (_event, vaultPath: string, config: ImageStorageConfig) => {
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

  // Shell handlers
  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Clipboard write text handler
  ipcMain.handle('clipboard:writeText', async (_event, text: string) => {
    try {
      clipboard.writeText(text);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Template handlers
  ipcMain.handle('template:list', async (_event, vaultPath: string) => {
    try {
      const templatesDir = path.join(vaultPath, TEMPLATES_DIR);
      const entries = await fs.readdir(templatesDir).catch(() => []);
      const templateFiles = entries.filter((f: string) => f.endsWith(TEMPLATE_EXT));

      const templates: Array<{ fileName: string; fieldCount: number; preview: string }> = [];
      for (const file of templateFiles) {
        const fullPath = path.join(templatesDir, file);
        const content = await fs.readFile(fullPath, 'utf-8');
        const { data, content: body } = matter(content);
        const fieldCount = Object.keys(data).length;
        const preview = body.split('\n').slice(0, 2).join(' ').substring(0, 50);
        templates.push({ fileName: file, fieldCount, preview });
      }

      return { success: true, templates };
    } catch (error) {
      return { success: false, error: String(error), templates: [] };
    }
  });

  ipcMain.handle('template:read', async (_event, vaultPath: string, fileName: string) => {
    try {
      const fullPath = path.join(vaultPath, TEMPLATES_DIR, fileName);
      const normalized = path.normalize(fullPath);
      if (!normalized.startsWith(path.normalize(path.join(vaultPath, TEMPLATES_DIR)))) {
        return { success: false, error: 'Invalid path' };
      }
      const content = await fs.readFile(normalized, 'utf-8');
      const { data, content: body } = matter(content);
      const fields: TemplateField[] = [];

      for (const [key, value] of Object.entries(data)) {
        if (key === 'title') continue;
        if (key === 'tags' || key === 'created' || key === 'modified') {
          if (typeof value === 'boolean' && value === true) {
            fields.push({ name: key, type: 'checkbox', autoSet: key as 'created' | 'modified' });
          } else if (key === 'tags' && Array.isArray(value)) {
            fields.push({ name: 'tags', type: 'tags', defaultValue: value });
          }
          continue;
        }
        if (typeof value === 'boolean') {
          fields.push({ name: key, type: 'checkbox', defaultValue: value });
        } else if (value instanceof Date) {
          fields.push({ name: key, type: 'date', defaultValue: value.toISOString().split('T')[0] });
        } else if (typeof value === 'string') {
          fields.push({ name: key, type: 'text', defaultValue: value });
        } else if (Array.isArray(value)) {
          fields.push({ name: key, type: 'text', defaultValue: String(value) });
        } else {
          fields.push({ name: key, type: 'text', defaultValue: String(value) });
        }
      }

      const template: Template = { fileName, fields, body };
      return { success: true, template };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'template:write',
    async (_event, vaultPath: string, fileName: string, content: string) => {
      try {
        const templatesDir = path.join(vaultPath, TEMPLATES_DIR);
        await fs.mkdir(templatesDir, { recursive: true });
        // Strip .md suffix if present to avoid double extension (e.g. meeting.md.md)
        const cleanFileName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
        const fullPath = path.join(templatesDir, cleanFileName + '.md');
        const normalized = path.normalize(fullPath);
        if (!normalized.startsWith(path.normalize(templatesDir))) {
          return { success: false, error: 'Invalid path' };
        }
        await fs.writeFile(normalized, content, 'utf-8');
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('template:delete', async (_event, vaultPath: string, fileName: string) => {
    try {
      const fullPath = path.join(vaultPath, TEMPLATES_DIR, fileName);
      const normalized = path.normalize(fullPath);
      if (!normalized.startsWith(path.normalize(path.join(vaultPath, TEMPLATES_DIR)))) {
        return { success: false, error: 'Invalid path' };
      }
      await fs.rm(normalized);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('template:getMappings', async (_event, vaultPath: string) => {
    try {
      const configPath = path.join(vaultPath, '.aimo-note/config.json');
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      return { success: true, mappings: config.templateMappings ?? {} };
    } catch {
      return { success: true, mappings: {} };
    }
  });

  ipcMain.handle(
    'template:setMappings',
    async (_event, vaultPath: string, mappings: Record<string, string>) => {
      try {
        const configPath = path.join(vaultPath, '.aimo-note/config.json');
        let existingConfig: Record<string, unknown> = {};
        try {
          const content = await fs.readFile(configPath, 'utf-8');
          existingConfig = JSON.parse(content);
        } catch {
          /* ignore */
        }
        existingConfig.templateMappings = mappings;
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
  );

  // Sync settings store (persisted to electron-store)
interface SyncSettingsStore {
  serverUrl: string | null;
  deviceId: string | null;
  remoteVaultId: string | null;
  remoteVaultName: string | null;
  lastPulledSeq: number;
}

// Sync state store (in-memory, rebuilt from electron-store on startup)
interface SyncState {
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingCount: number;
  lastTrigger: string | null;
}

// Persistent store for sync settings (survives app restarts)
const syncSettingsStore = new Store<SyncSettingsStore>({
  name: 'sync-settings',
  defaults: {
    serverUrl: null,
    deviceId: null,
    remoteVaultId: null,
    remoteVaultName: null,
    lastPulledSeq: 0,
  },
});

// Get auth token for server adapter
function getAuthToken(): string | null {
  const encrypted = authStore.get('encryptedToken');
  if (!encrypted) return null;

  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(encrypted, 'base64');
      return safeStorage.decryptString(buffer);
    } else {
      return encrypted;
    }
  } catch {
    return null;
  }
}

// Build ServerAdapter config for sync operations
function buildServerAdapter(): { baseUrl: string; deviceId: string; getToken: () => string | null } | null {
  const serverUrl = syncSettingsStore.get('serverUrl');
  const deviceId = syncSettingsStore.get('deviceId');
  if (!serverUrl || !deviceId) return null;

  return {
    baseUrl: serverUrl,
    deviceId,
    getToken: getAuthToken,
  };
}

// Sync state (in-memory, updated by operations)
let syncState: SyncState = {
  status: 'DISABLED',
  lastSyncAt: null,
  lastError: null,
  pendingCount: 0,
  lastTrigger: null,
};

// In-memory map of conflictId -> conflictCopyPath for conflict copy accessibility
// This is populated when client_sync_engine creates conflict copies and calls recordConflictCopyPath
const conflictCopyPaths = new Map<string, string>();

// In-memory map of conflictId -> resolution timestamp for pending resolutions
// These are resolutions that happened locally while offline or with sync disabled,
// and need to be replayed to the server during the next sync:trigger
const pendingConflictResolutions = new Map<string, number>();

// Local map of conflictId -> resolution path for local records
// Note: The server API (POST /conflicts/:id/resolve) only accepts vaultId in its body,
// so resolutionPath cannot be propagated to the server. It is stored locally only.
const localResolutionPaths = new Map<string, string>();

  ipcMain.handle('sync:getStatus', async () => {
    // Return current sync state
    return {
      success: true,
      status: syncState.status,
      lastSyncAt: syncState.lastSyncAt,
      error: syncState.lastError,
      pendingCount: syncState.pendingCount,
      isEnabled: syncState.status !== 'DISABLED',
      vaultId: syncSettingsStore.get('remoteVaultId'),
      vaultName: syncSettingsStore.get('remoteVaultName'),
    };
  });

  ipcMain.handle('sync:trigger', async (_event, trigger?: string) => {
    if (syncState.status === 'DISABLED') {
      return { success: false, error: 'Sync is disabled' };
    }

    const serverUrl = syncSettingsStore.get('serverUrl');
    const deviceId = syncSettingsStore.get('deviceId');
    const remoteVaultId = syncSettingsStore.get('remoteVaultId');

    if (!serverUrl || !deviceId || !remoteVaultId) {
      return { success: false, error: 'Sync not configured' };
    }

    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured' };
    }

    syncState.status = 'SYNCING';
    syncState.lastError = null;
    // Record trigger in runtime metadata per spec Phase 3 cross-invariant
    if (trigger) {
      syncState.lastTrigger = trigger;
    }

    try {
      const token = getAuthToken();
      const baseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        baseHeaders['Authorization'] = `Bearer ${token}`;
      }

      // Step 1: Pull remote changes first
      // Use persisted lastPulledSeq to only fetch changes since last sync
      const sinceSeq = syncSettingsStore.get('lastPulledSeq') ?? 0;
      const pullResponse = await fetch(
        `${adapterConfig.baseUrl}/api/v1/sync/pull?vaultId=${encodeURIComponent(remoteVaultId)}&sinceSeq=${sinceSeq}&limit=200`,
        { method: 'GET', headers: baseHeaders }
      );

      if (!pullResponse.ok) {
        throw new Error(`Pull failed: HTTP ${pullResponse.status}`);
      }

const pullData = await pullResponse.json() as {
        data?: {
          commits?: Array<{ commitSeq: number }>;
          latestSeq: number;
        };
      };
      const latestSeq = pullData?.data?.latestSeq ?? 0;

      // Step 2: Check which blobs we have (has-blobs)
      const blobHashes: string[] = []; // TODO: Get from local vault - pending changes blob hashes
      const hasBlobsResponse = await fetch(
        `${adapterConfig.baseUrl}/api/v1/sync/has-blobs?vaultId=${encodeURIComponent(remoteVaultId)}`,
        {
          method: 'POST',
          headers: { ...baseHeaders, 'X-Request-Id': `hasblobs-${Date.now()}-${adapterConfig.deviceId}` },
          body: JSON.stringify({ blobHashes }),
        }
      );

      // Step 3: Upload missing blobs (if any)
      if (hasBlobsResponse.ok) {
        const hasBlobsData = await hasBlobsResponse.json() as {
          data?: { missing?: string[] };
        };
        const missingBlobHashes = hasBlobsData?.data?.missing ?? [];
        if (missingBlobHashes.length > 0) {
          // Get presigned upload URLs and upload blobs
          const uploadUrlResponse = await fetch(
            `${adapterConfig.baseUrl}/api/v1/sync/blob-upload-url?vaultId=${encodeURIComponent(remoteVaultId)}`,
            {
              method: 'POST',
              headers: { ...baseHeaders, 'X-Request-Id': `uploadurls-${Date.now()}-${adapterConfig.deviceId}` },
              body: JSON.stringify({ blobHashes: missingBlobHashes }),
            }
          );
          if (uploadUrlResponse.ok) {
            const uploadUrlsData = await uploadUrlResponse.json() as {
              data?: Array<{ blobHash: string; uploadUrl: string }>;
            };
            for (const item of uploadUrlsData?.data ?? []) {
              // TODO: Read blob content from local vault and upload to presigned URL
              await fetch(item.uploadUrl, { method: 'PUT', body: '' });
            }
          }
        }
      }

      // Step 4: Commit local changes
      const pendingChanges: unknown[] = []; // TODO: Get from local change logger
      if (pendingChanges.length > 0) {
        const commitRequestId = `commit-${Date.now()}-${adapterConfig.deviceId}`;
        await fetch(`${adapterConfig.baseUrl}/api/v1/sync/commit`, {
          method: 'POST',
          headers: { ...baseHeaders, 'X-Request-Id': commitRequestId },
          body: JSON.stringify({
            vaultId: remoteVaultId,
            deviceId: adapterConfig.deviceId,
            requestId: commitRequestId,
            baseSeq: latestSeq,
            changes: pendingChanges,
          }),
        });
      }

      // Step 5: Acknowledge the pulled changes
      if (latestSeq > 0) {
        const ackRequestId = `ack-${Date.now()}-${adapterConfig.deviceId}`;
        const ackResponse = await fetch(`${adapterConfig.baseUrl}/api/v1/sync/ack`, {
          method: 'POST',
          headers: { ...baseHeaders, 'X-Request-Id': ackRequestId },
          body: JSON.stringify({
            vaultId: remoteVaultId,
            deviceId: adapterConfig.deviceId,
            ackedSeq: latestSeq,
          }),
        });
        // Persist cursor after successful ack
        if (ackResponse.ok) {
          syncSettingsStore.set('lastPulledSeq', latestSeq);
        }
      }

      // Step 3: Replay any pending conflict resolutions that failed or were queued while offline
      if (pendingConflictResolutions.size > 0) {
        const resolutionIds = Array.from(pendingConflictResolutions.keys());
        for (const conflictId of resolutionIds) {
          try {
            const resolveRequestId = `resolve-${Date.now()}-${adapterConfig.deviceId}`;
            const response = await fetch(
              `${adapterConfig.baseUrl}/api/v1/sync/conflicts/${encodeURIComponent(conflictId)}/resolve`,
              {
                method: 'POST',
                headers: { ...baseHeaders, 'X-Request-Id': resolveRequestId },
                body: JSON.stringify({ vaultId: remoteVaultId }),
              }
            );
            // 200 = resolved, 404 = already resolved or never existed (idempotent)
            if (response.ok || response.status === 404) {
              pendingConflictResolutions.delete(conflictId);
            }
          } catch (error) {
            // Continue with other resolutions even if one fails
          }
        }
      }

      syncState.status = 'IDLE';
      syncState.lastSyncAt = new Date().toISOString();

      return {
        success: true,
        status: 'SYNCING',
        lastSyncAt: syncState.lastSyncAt,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      syncState.status = 'ERROR';
      syncState.lastError = errorMessage;
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('sync:getConflicts', async (_event, vaultId: string) => {
    // Use server adapter to get conflicts from server API
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: true, conflicts: [] };
    }

    const remoteVaultId = syncSettingsStore.get('remoteVaultId');
    if (!remoteVaultId) {
      return { success: true, conflicts: [] };
    }

    // Use provided vaultId or fall back to configured remoteVaultId
    const queryVaultId = vaultId || remoteVaultId;

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${adapterConfig.baseUrl}/api/v1/sync/conflicts?vaultId=${encodeURIComponent(queryVaultId)}`,
        { method: 'GET', headers }
      );

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}`, conflicts: [] };
      }

      const data = await response.json() as {
        data?: Array<{
          id: string;
          filePath: string;
          expectedBaseRevision: string;
          winningRevision: string;
          losingRevision: string;
          winningBlobHash: string | null;
          winningCommitSeq: number;
          losingDeviceId?: string | null;
          resolvedAt?: string | null;
          createdAt: string;
        }>;
      };

      return {
        success: true,
        conflicts: (data?.data ?? []).map((c) => ({
          id: c.id,
          filePath: c.filePath,
          expectedBaseRevision: c.expectedBaseRevision,
          actualHeadRevision: c.winningRevision,
          remoteBlobHash: c.winningBlobHash ?? null,
          winningCommitSeq: c.winningCommitSeq,
          losingDeviceId: c.losingDeviceId ?? null,
          resolvedAt: c.resolvedAt ?? null,
          createdAt: c.createdAt,
          conflictCopyPath: conflictCopyPaths.get(c.id) ?? null,
        })),
      };
    } catch (error) {
      return { success: false, error: String(error), conflicts: [] };
    }
  });

  ipcMain.handle('sync:resolveConflict', async (_event, conflictId: string, resolutionPath: string) => {
    const adapterConfig = buildServerAdapter();
    const remoteVaultId = syncSettingsStore.get('remoteVaultId');

    // Record resolution locally first - this ensures we don't lose the resolution intent
    // even if the server call fails or sync is disabled
    pendingConflictResolutions.set(conflictId, Date.now());
    if (resolutionPath) {
      localResolutionPaths.set(conflictId, resolutionPath);
    }

    // If sync is DISABLED, do not make network requests — spec: "不得偷偷绕过开关直接发起远端请求"
    if (syncState.status === 'DISABLED') {
      return { success: true, locallyResolved: true, pendingPropagation: true };
    }

    // If sync is configured, propagate to server
    if (adapterConfig && remoteVaultId) {
      try {
        const token = getAuthToken();
        const requestId = `resolve-${Date.now()}-${adapterConfig.deviceId}`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Device-Id': adapterConfig.deviceId,
          'X-Request-Id': requestId,
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(
          `${adapterConfig.baseUrl}/api/v1/sync/conflicts/${encodeURIComponent(conflictId)}/resolve`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ vaultId: remoteVaultId, resolutionPath }),
          }
        );

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` };
        }

        // Successfully propagated - remove from pending
        pendingConflictResolutions.delete(conflictId);
        return { success: true };
      } catch (error) {
        // Server call failed but locally recorded - will retry on next sync:trigger
        return { success: true, locallyResolved: true, pendingPropagation: true };
      }
    }

    return { success: false, error: 'Sync not configured' };
  });

  ipcMain.handle('sync:rollback', async (_event, vaultPath: string, filePath: string, targetVersion: string) => {
    const adapterConfig = buildServerAdapter();
    const remoteVaultId = syncSettingsStore.get('remoteVaultId');

    if (!vaultPath) {
      return { success: false, error: 'Vault path is required' };
    }

    // Note: Rollback always requires network to download blob content.
    // We do NOT early-return on DISABLED because per spec "rollback 仍可先完成本地写回与入队"
    // — the network request will fail naturally if offline, and the caller should handle that.
    // When sync is re-enabled, the caller can retry the rollback.

    if (!adapterConfig || !remoteVaultId) {
      return { success: false, error: 'Sync not configured' };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Step 1: Get blob reference for the target revision
      const historyBlobResponse = await fetch(
        `${adapterConfig.baseUrl}/api/v1/sync/history/blob?vaultId=${encodeURIComponent(remoteVaultId)}&revision=${encodeURIComponent(targetVersion)}`,
        { method: 'GET', headers }
      );

      if (!historyBlobResponse.ok) {
        return { success: false, error: `Failed to get revision blob: HTTP ${historyBlobResponse.status}` };
      }

      const historyBlobData = await historyBlobResponse.json() as {
        data?: { blobHash: string; revision: string };
      };

      if (!historyBlobData?.data?.blobHash) {
        return { success: false, error: 'Revision blob not found' };
      }

      const blobHash = historyBlobData.data.blobHash;

      // Step 2: Get download URL for the blob
      const downloadUrlResponse = await fetch(
        `${adapterConfig.baseUrl}/api/v1/sync/blob-download-url`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ vaultId: remoteVaultId, blobHash }),
        }
      );

      if (!downloadUrlResponse.ok) {
        return { success: false, error: `Failed to get download URL: HTTP ${downloadUrlResponse.status}` };
      }

      const downloadUrlData = await downloadUrlResponse.json() as {
        data?: { downloadUrl: string };
      };

      if (!downloadUrlData?.data?.downloadUrl) {
        return { success: false, error: 'Download URL not available' };
      }

      // Step 3: Download the blob content with retry on 401/403
      let contentResponse = await fetch(downloadUrlData.data.downloadUrl);
      let downloadUrl = downloadUrlData.data.downloadUrl;

      // If we get 401/403, the URL may have expired - refresh and retry once
      if (contentResponse.status === 401 || contentResponse.status === 403) {
        // Refresh the download URL
        const refreshResponse = await fetch(
          `${adapterConfig.baseUrl}/api/v1/sync/blob-download-url`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ vaultId: remoteVaultId, blobHash }),
          }
        );

        if (!refreshResponse.ok) {
          return { success: false, error: `Failed to refresh download URL: HTTP ${refreshResponse.status}` };
        }

        const refreshData = await refreshResponse.json() as {
          data?: { downloadUrl: string };
        };

        if (!refreshData?.data?.downloadUrl) {
          return { success: false, error: 'Refreshed download URL not available' };
        }

        downloadUrl = refreshData.data.downloadUrl;
        contentResponse = await fetch(downloadUrl);
      }

      if (!contentResponse.ok) {
        return { success: false, error: `Failed to download content: HTTP ${contentResponse.status}` };
      }

      const content = await contentResponse.text();

      // Step 4: Write restored content to the vault file
      const fullPath = path.join(vaultPath, filePath);
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');

      // Step 5: Trigger sync to propagate rollback to other devices via normal sync flow
      // This ensures rollback is committed through the normal commit -> pull -> ack cycle
      // Note: The renderer should call sync.trigger() after receiving this response
      // to complete the sync cycle. See HistoryPanel.tsx for the expected pattern.

      return {
        success: true,
        data: {
          filePath,
          restoredVersion: targetVersion,
          newVersion: targetVersion, // After rollback, new version equals the restored version
          content,
          trigger: 'rollback' as const,
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('sync:configure', async (_event, serverUrl: string, deviceId: string) => {
    // Store serverUrl and deviceId in persistent settings
    syncSettingsStore.set('serverUrl', serverUrl);
    syncSettingsStore.set('deviceId', deviceId);
    syncState.status = 'IDLE';
    return { success: true };
  });

  ipcMain.handle('sync:listVaults', async () => {
    // Use server adapter to list vaults from the server
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured' };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${adapterConfig.baseUrl}/api/v1/vaults`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}`, vaults: [] };
      }

      const data = await response.json() as { vaults?: Array<{ id: string; name: string; description?: string }> };
      return { success: true, vaults: data.vaults ?? [] };
    } catch (error) {
      return { success: false, error: String(error), vaults: [] };
    }
  });

  ipcMain.handle('sync:createVault', async (_event, name: string, description?: string) => {
    // Use server adapter to create vault on server
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured' };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${adapterConfig.baseUrl}/api/v1/vaults`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, description }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { vault?: { id: string; name: string; description?: string } };
      return { success: true, vault: data.vault };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('sync:bindVault', async (_event, vaultId: string, vaultName?: string) => {
    // Persist the remote vault ID to local settings store
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured' };
    }

    // Store the bound vault info
    syncSettingsStore.set('remoteVaultId', vaultId);
    syncSettingsStore.set('remoteVaultName', vaultName ?? null);
    syncState.status = 'IDLE';

    return { success: true };
  });

  ipcMain.handle('sync:unbindVault', async () => {
    // Clear the bound vault from settings
    syncSettingsStore.set('remoteVaultId', null);
    syncSettingsStore.set('remoteVaultName', null);
    syncState.status = 'DISABLED';
    return { success: true };
  });

  ipcMain.handle('sync:registerDevice', async (_event, vaultId: string, deviceName: string) => {
    // Use server adapter to register this device with the vault
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured' };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${adapterConfig.baseUrl}/api/v1/devices/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ vaultId, deviceId: adapterConfig.deviceId, deviceName }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { device?: { deviceId: string } };
      return { success: true, deviceId: data.device?.deviceId };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('sync:listHistory', async (_event, vaultId: string, filePath: string, page?: number, pageSize?: number) => {
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured', items: [] };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const params = new URLSearchParams({
        vaultId,
        filePath,
        ...(page !== undefined ? { page: String(page) } : {}),
        ...(pageSize !== undefined ? { pageSize: String(pageSize) } : {}),
      });

      const response = await fetch(
        `${adapterConfig.baseUrl}/api/v1/sync/history?${params}`,
        { method: 'GET', headers }
      );

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}`, items: [] };
      }

      const data = await response.json() as {
        data?: {
          items: Array<{
            revision: string;
            blobHash: string | null;
            commitSeq: number;
            createdAt: string;
            deviceId: string;
            isDeleted: boolean;
          }>;
          page: number;
          pageSize: number;
          hasMore: boolean;
        };
      };

      return {
        success: true,
        items: data?.data?.items ?? [],
        page: data?.data?.page ?? 1,
        pageSize: data?.data?.pageSize ?? 50,
        hasMore: data?.data?.hasMore ?? false,
      };
    } catch (error) {
      return { success: false, error: String(error), items: [] };
    }
  });

  ipcMain.handle('sync:getHistoryBlob', async (_event, vaultId: string, revision: string) => {
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured' };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${adapterConfig.baseUrl}/api/v1/sync/history/blob?vaultId=${encodeURIComponent(vaultId)}&revision=${encodeURIComponent(revision)}`,
        { method: 'GET', headers }
      );

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as {
        data?: {
          revision: string;
          blobHash: string;
          sizeBytes: number;
          mimeType: string | null;
          isDeleted: boolean;
        };
      };

      if (!data?.data) {
        return { success: false, error: 'History blob not found' };
      }

      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('sync:recordConflictCopyPath', async (_event, conflictId: string, conflictCopyPath: string) => {
    // Store the conflict copy path for later retrieval by ConflictListPanel
    conflictCopyPaths.set(conflictId, conflictCopyPath);
    return { success: true };
  });

  ipcMain.handle('sync:openConflictCopy', async (_event, conflictId: string, filePath: string) => {
    // Prefer conflict copy path from our in-memory map if available, otherwise fall back to provided path
    const actualPath = conflictCopyPaths.get(conflictId) ?? filePath;
    try {
      const result = await shell.openPath(actualPath);
      if (result) {
        return { success: false, error: result };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Diagnostics IPC handlers
  ipcMain.handle('sync:getDiagnostics', async (_event, vaultId: string) => {
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured', diagnostics: null };
    }

    const remoteVaultId = syncSettingsStore.get('remoteVaultId');
    if (!remoteVaultId) {
      return { success: false, error: 'No vault bound', diagnostics: null };
    }

    const queryVaultId = vaultId || remoteVaultId;

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${adapterConfig.baseUrl}/api/v1/sync/diagnostics?vaultId=${encodeURIComponent(queryVaultId)}&deviceId=${encodeURIComponent(adapterConfig.deviceId)}`,
        { method: 'GET', headers }
      );

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}`, diagnostics: null };
      }

      const data = await response.json() as {
        data?: {
          lastTriggerSource: string | null;
          offlineReason: string | null;
          nextRetryAt: string | null;
          lastFailedRequestId: string | null;
          lastFailedRequestDeviceId: string | null;
          lastSuccessfulSyncAt: string | null;
          consecutiveFailures: number;
        };
      };

      return { success: true, diagnostics: data?.data ?? null };
    } catch (error) {
      return { success: false, error: String(error), diagnostics: null };
    }
  });

  ipcMain.handle('sync:recordRuntimeEvent', async (_event, eventData: {
    vaultId: string;
    deviceId: string;
    trigger: string;
    retryCount: number;
    offlineStartedAt?: string | null;
    recoveredAt?: string | null;
    nextRetryAt?: string | null;
    requestId: string;
  }) => {
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured', accepted: false, deduplicated: false };
    }

    const remoteVaultId = syncSettingsStore.get('remoteVaultId');
    if (!remoteVaultId) {
      return { success: false, error: 'No vault bound', accepted: false, deduplicated: false };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
        'X-Request-Id': eventData.requestId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${adapterConfig.baseUrl}/api/v1/sync/diagnostics/events`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            vaultId: eventData.vaultId || remoteVaultId,
            deviceId: eventData.deviceId,
            trigger: eventData.trigger,
            retryCount: eventData.retryCount,
            offlineStartedAt: eventData.offlineStartedAt,
            recoveredAt: eventData.recoveredAt,
            nextRetryAt: eventData.nextRetryAt,
            requestId: eventData.requestId,
          }),
        }
      );

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}`, accepted: false, deduplicated: false };
      }

      const data = await response.json() as {
        data?: {
          accepted: boolean;
          deduplicated: boolean;
          processedAt: string;
        };
      };

      return {
        success: true,
        accepted: data?.data?.accepted ?? true,
        deduplicated: data?.data?.deduplicated ?? false,
      };
    } catch (error) {
      return { success: false, error: String(error), accepted: false, deduplicated: false };
    }
  });

  // =============================================================================
  // Snapshot IPC handlers
  // =============================================================================

  // GET /api/v1/snapshots - List snapshots
  ipcMain.handle('sync:listSnapshots', async (_event, vaultId: string, page?: number, pageSize?: number) => {
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured', items: [], page: 1, pageSize: 20, total: 0, hasMore: false };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const params = new URLSearchParams({
        vaultId,
        page: String(page ?? 1),
        pageSize: String(pageSize ?? 20),
      });

      const response = await fetch(
        `${adapterConfig.baseUrl}/api/v1/snapshots?${params}`,
        { method: 'GET', headers }
      );

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}`, items: [], page: 1, pageSize: 20, total: 0, hasMore: false };
      }

      const data = await response.json() as {
        data?: {
          items: SnapshotRecord[];
          page: number;
          pageSize: number;
          total: number;
          hasMore: boolean;
        };
      };

      return {
        success: true,
        items: data?.data?.items ?? [],
        page: data?.data?.page ?? 1,
        pageSize: data?.data?.pageSize ?? 20,
        total: data?.data?.total ?? 0,
        hasMore: data?.data?.hasMore ?? false,
      };
    } catch (error) {
      return { success: false, error: String(error), items: [], page: 1, pageSize: 20, total: 0, hasMore: false };
    }
  });

  // POST /api/v1/snapshots - Create snapshot
  ipcMain.handle('sync:createSnapshot', async (_event, vaultId: string, description?: string) => {
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured' };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${adapterConfig.baseUrl}/api/v1/snapshots`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ vaultId, description }),
      });

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { data?: SnapshotRecord };
      return { success: true, snapshot: data?.data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // GET /api/v1/snapshots/:id - Get snapshot status
  ipcMain.handle('sync:getSnapshot', async (_event, snapshotId: string) => {
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured' };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${adapterConfig.baseUrl}/api/v1/snapshots/${encodeURIComponent(snapshotId)}`,
        { method: 'GET', headers }
      );

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { data?: SnapshotRecord };
      return { success: true, snapshot: data?.data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // POST /api/v1/snapshots/:id/restore - Restore snapshot
  ipcMain.handle('sync:restoreSnapshot', async (_event, snapshotId: string, vaultId: string, deviceId?: string) => {
    const adapterConfig = buildServerAdapter();
    if (!adapterConfig) {
      return { success: false, error: 'Sync not configured' };
    }

    try {
      const token = getAuthToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Device-Id': adapterConfig.deviceId,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${adapterConfig.baseUrl}/api/v1/snapshots/${encodeURIComponent(snapshotId)}/restore`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ vaultId, deviceId }),
        }
      );

      if (!response.ok) {
        // Check for 409 Conflict (restore already in progress)
        if (response.status === 409) {
          const errorData = await response.json() as {
            error?: {
              message?: string;
              existingTask?: SnapshotRestoreResult;
            };
          };
          return {
            success: false,
            error: errorData.error?.message ?? 'Restore already in progress',
            existingTask: errorData.error?.existingTask,
          };
        }
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json() as { data?: SnapshotRestoreResult };
      return { success: true, result: data?.data };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] Vault/Graph/Search/ImageStorage/Sync handlers registered');
}
