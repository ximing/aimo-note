import { app, ipcMain, safeStorage, dialog, clipboard, shell } from 'electron';
import Store from 'electron-store';
import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import type { SearchResult } from '@aimo-note/dto';
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
      const content = await fs.readFile(fullPath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: String(error) };
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
      return { success: true, content };
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
        const fullPath = path.join(templatesDir, fileName);
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
    } catch (error) {
      return { success: false, error: String(error), mappings: {} };
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

  console.log('[IPC] Vault/Graph/Search/ImageStorage handlers registered');
}
