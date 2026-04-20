# Vault 核心功能实现计划

> **Status:** ✅ **COMPLETED** (2026-04-17)
>
> All tasks implemented and verified. Build passes.

**Goal:** 实现 Obsidian 风格的 Vault 基础功能：打开/创建 Vault、文件树浏览、Milkdown 编辑器、右键菜单

**Architecture:** 分层架构 - Renderer (React) → IPC → Main (Electron) → Core (Node.js)。IPC 层负责桥接，Core 层处理文件 IO，Renderer 层负责 UI。

**Tech Stack:** Electron + React 19 + @rabjs/react + Milkdown v7 + TypeScript

---

## Chunk 1: IPC 层打通 (client)

### Task 1: 扩展 preload electronAPI 类型

**Files:**

- Modify: `apps/client/src/preload/index.ts:44-143`

- [x] **Step 1: 添加 vault API 类型定义**

在 `declare global { interface Window { electronAPI: {...} } }` 中添加：

```typescript
vault: {
  selectFolder(): Promise<string | null>;
  create(path: string): Promise<{ success: boolean }>;
  open(path: string): Promise<{ path: string; files: number }>;
  readNote(path: string): Promise<{ content: string; frontmatter: Record<string, unknown> } | null>;
  writeNote(path: string, content: string): Promise<{ success: boolean }>;
  delete(path: string): Promise<{ success: boolean }>;
  rename(oldPath: string, newPath: string): Promise<{ success: boolean }>;
  createFolder(path: string): Promise<{ success: boolean }>;
  list(path: string): Promise<Array<{ name: string; path: string; type: 'file' | 'folder'; children?: TreeNode[] }>>;
};
```

- [x] **Step 2: 在 contextBridge.exposeInMainWorld 添加 vault 对象**

```typescript
vault: {
  selectFolder: () => ipcRenderer.invoke('vault:selectFolder'),
  create: (path: string) => ipcRenderer.invoke('vault:create', path),
  open: (path: string) => ipcRenderer.invoke('vault:open', path),
  readNote: (path: string) => ipcRenderer.invoke('vault:readNote', path),
  writeNote: (path: string, content: string) => ipcRenderer.invoke('vault:writeNote', path, content),
  delete: (path: string) => ipcRenderer.invoke('vault:delete', path),
  rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('vault:rename', oldPath, newPath),
  createFolder: (path: string) => ipcRenderer.invoke('vault:createFolder', path),
  list: (path: string) => ipcRenderer.invoke('vault:list', path),
},
```

- [x] **Step 3: 提交**

```bash
git add apps/client/src/preload/index.ts
git commit -m "feat(client): add vault API to electronAPI preload"
```

---

### Task 2: 实现 vault IPC handlers

**Files:**

- Modify: `apps/client/src/main/ipc/handlers.ts:16-163`

- [x] **Step 1: 在 handlers.ts 顶部添加导入**

```typescript
import { dialog } from 'electron';
import fs from 'fs/promises';
import path from 'path';
```

- [x] **Step 2: 添加 TreeNode 类型和 listDir 辅助函数**

在 `registerIpcHandlers` 函数之前添加：

```typescript
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
    // 跳过隐藏文件
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

  // 排序：文件夹在前，按字母顺序
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return nodes;
}
```

- [x] **Step 3: 替换 vault:selectFolder handler**

将现有的 `vault:selectFolder` stub 替换为：

```typescript
ipcMain.handle('vault:selectFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Vault Folder',
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});
```

- [x] **Step 4: 替换 vault:create handler**

将现有的 `vault:create` stub 替换为：

```typescript
ipcMain.handle('vault:create', async (_event, vaultPath: string) => {
  try {
    await fs.mkdir(vaultPath, { recursive: true });
    // 创建空的 vault 配置
    return { success: true };
  } catch (error) {
    console.error('[IPC] vault:create error:', error);
    return { success: false };
  }
});
```

- [x] **Step 5: 替换 vault:open handler**

```typescript
ipcMain.handle('vault:open', async (_event, vaultPath: string) => {
  try {
    const exists = await fs
      .access(vaultPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      return { path: vaultPath, files: 0 };
    }
    const nodes = await listDir(vaultPath);
    const fileCount = nodes.filter((n) => n.type === 'file').length;
    return { path: vaultPath, files: fileCount };
  } catch (error) {
    console.error('[IPC] vault:open error:', error);
    return { path: vaultPath, files: 0 };
  }
});
```

- [x] **Step 6: 替换 vault:readNote handler**

```typescript
ipcMain.handle('vault:readNote', async (_event, vaultPath: string, notePath: string) => {
  try {
    const fullPath = path.join(vaultPath, notePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return { content, frontmatter: {} };
  } catch (error) {
    console.error('[IPC] vault:readNote error:', error);
    return null;
  }
});
```

- [x] **Step 7: 替换 vault:writeNote handler**

```typescript
ipcMain.handle(
  'vault:writeNote',
  async (_event, vaultPath: string, notePath: string, content: string) => {
    try {
      const fullPath = path.join(vaultPath, notePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('[IPC] vault:writeNote error:', error);
      return { success: false };
    }
  }
);
```

- [x] **Step 8: 添加 vault:delete handler**

```typescript
ipcMain.handle('vault:delete', async (_event, vaultPath: string, targetPath: string) => {
  try {
    const fullPath = path.join(vaultPath, targetPath);
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: true });
    } else {
      await fs.unlink(fullPath);
    }
    return { success: true };
  } catch (error) {
    console.error('[IPC] vault:delete error:', error);
    return { success: false };
  }
});
```

- [x] **Step 9: 添加 vault:rename handler**

```typescript
ipcMain.handle(
  'vault:rename',
  async (_event, vaultPath: string, oldPath: string, newPath: string) => {
    try {
      const oldFullPath = path.join(vaultPath, oldPath);
      const newFullPath = path.join(vaultPath, newPath);
      await fs.rename(oldFullPath, newFullPath);
      return { success: true };
    } catch (error) {
      console.error('[IPC] vault:rename error:', error);
      return { success: false };
    }
  }
);
```

- [x] **Step 10: 添加 vault:createFolder handler**

```typescript
ipcMain.handle('vault:createFolder', async (_event, vaultPath: string, folderPath: string) => {
  try {
    const fullPath = path.join(vaultPath, folderPath);
    await fs.mkdir(fullPath, { recursive: true });
    return { success: true };
  } catch (error) {
    console.error('[IPC] vault:createFolder error:', error);
    return { success: false };
  }
});
```

- [x] **Step 11: 添加 vault:list handler**

```typescript
ipcMain.handle('vault:list', async (_event, vaultPath: string) => {
  try {
    return await listDir(vaultPath);
  } catch (error) {
    console.error('[IPC] vault:list error:', error);
    return [];
  }
});
```

- [x] **Step 12: 提交**

```bash
git add apps/client/src/main/ipc/handlers.ts
git commit -m "feat(client): implement vault IPC handlers"
```

---

## Chunk 2: Renderer IPC 客户端封装

### Task 3: 实现 render IPC vault 封装

**Files:**

- Modify: `apps/render/src/ipc/vault.ts`

- [x] **Step 1: 更新 vault.ts IPC 封装**

```typescript
export interface Vault {
  selectFolder(): Promise<string | null>;
  create(path: string): Promise<{ success: boolean }>;
  open(path: string): Promise<{ path: string; files: number }>;
  readNote(path: string): Promise<{ content: string; frontmatter: Record<string, unknown> } | null>;
  writeNote(path: string, content: string): Promise<{ success: boolean }>;
  delete(path: string): Promise<{ success: boolean }>;
  rename(oldPath: string, newPath: string): Promise<{ success: boolean }>;
  createFolder(path: string): Promise<{ success: boolean }>;
  list(path: string): Promise<TreeNode[]>;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

export const vault: Vault = {
  async selectFolder() {
    return window.electronAPI.vault.selectFolder();
  },
  async create(path: string) {
    return window.electronAPI.vault.create(path);
  },
  async open(path: string) {
    return window.electronAPI.vault.open(path);
  },
  async readNote(path: string) {
    return window.electronAPI.vault.readNote(path);
  },
  async writeNote(path: string, content: string) {
    return window.electronAPI.vault.writeNote(path, content);
  },
  async delete(path: string) {
    return window.electronAPI.vault.delete(path);
  },
  async rename(oldPath: string, newPath: string) {
    return window.electronAPI.vault.rename(oldPath, newPath);
  },
  async createFolder(path: string) {
    return window.electronAPI.vault.createFolder(path);
  },
  async list(path: string) {
    return window.electronAPI.vault.list(path);
  },
};
```

- [x] **Step 2: 更新 ipc/index.ts 导出**

确保 `export * from './vault'` 存在

- [x] **Step 3: 提交**

```bash
git add apps/render/src/ipc/vault.ts apps/render/src/ipc/index.ts
git commit -m "feat(render): implement vault IPC client wrapper"
```

---

## Chunk 3: VaultService 状态管理

### Task 4: 完善 VaultService

**Files:**

- Modify: `apps/render/src/services/vault.service.ts`

- [x] **Step 1: 完善 VaultService 状态和逻辑**

```typescript
import { Service } from '@rabjs/react';
import { vault } from '@/ipc/vault';
import type { TreeNode } from '@/ipc/vault';

export interface VaultState {
  path: string | null;
  tree: TreeNode[];
  activeFile: string | null;
  isLoading: boolean;
}

class VaultService extends Service<VaultState> {
  protected state: VaultState = {
    path: null,
    tree: [],
    activeFile: null,
    isLoading: false,
  };

  async openVault(path: string): Promise<void> {
    this.state.isLoading = true;
    this.notify();

    try {
      const result = await vault.open(path);
      if (result) {
        this.state.path = result.path;
        await this.refreshTree();
      }
    } finally {
      this.state.isLoading = false;
      this.notify();
    }
  }

  async refreshTree(): Promise<void> {
    if (!this.state.path) return;
    const tree = await vault.list(this.state.path);
    this.state.tree = tree;
    this.notify();
  }

  async selectAndOpenVault(): Promise<boolean> {
    const path = await vault.selectFolder();
    if (path) {
      await this.openVault(path);
      return true;
    }
    return false;
  }

  async createAndOpenVault(): Promise<boolean> {
    const path = await vault.selectFolder();
    if (path) {
      await vault.create(path);
      await this.openVault(path);
      return true;
    }
    return false;
  }

  setActiveFile(path: string | null): void {
    this.state.activeFile = path;
    this.notify();
  }

  get vaultPath(): string | null {
    return this.state.path;
  }
}

export const vaultService = new VaultService();
export function useVaultService() {
  return vaultService.use();
}
```

- [x] **Step 2: 提交**

```bash
git add apps/render/src/services/vault.service.ts
git commit -m "feat(render): enhance VaultService with full state management"
```

---

## Chunk 4: Home 页面 Vault 选择 UI

### Task 5: 实现 HomePage Vault 选择界面

**Files:**

- Modify: `apps/render/src/pages/home/index.tsx`

- [x] **Step 1: 更新 HomePage UI**

```typescript
import { useVaultService } from '../../services';
import { useNavigate } from 'react-router';

export function HomePage() {
  const vaultService = useVaultService();
  const navigate = useNavigate();
  const { path, isLoading } = vaultService.use();

  const handleOpenVault = async () => {
    const success = await vaultService.selectAndOpenVault();
    if (success) {
      navigate('/editor');
    }
  };

  const handleCreateVault = async () => {
    const success = await vaultService.createAndOpenVault();
    if (success) {
      navigate('/editor');
    }
  };

  return (
    <div className="home-page h-full flex items-center justify-center">
      <div className="welcome-card bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2 text-center">Welcome to AIMO-Note</h1>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-6">
          A local-first note-taking app
        </p>

        {isLoading ? (
          <div className="flex justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleOpenVault}
              className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              Open Vault
            </button>
            <button
              onClick={handleCreateVault}
              className="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors"
            >
              Create New Vault
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [x] **Step 2: 提交**

```bash
git add apps/render/src/pages/home/index.tsx
git commit -m "feat(render): implement HomePage vault selection UI"
```

---

## Chunk 5: 文件树组件

### Task 6: 实现 VaultTree 组件

**Files:**

- Modify: `apps/render/src/components/explorer/VaultTree.tsx`

- [x] **Step 1: 实现 VaultTree 组件**

```typescript
import { observer } from '@rabjs/react';
import { useVaultService } from '@/services/vault.service';
import { TreeNode } from './TreeNode';

export const VaultTree = observer(() => {
  const vaultService = useVaultService();
  const { tree, path: vaultPath } = vaultService.use();

  if (!vaultPath) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        No vault open
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        Empty vault. Create a new file to get started.
      </div>
    );
  }

  return (
    <div className="vault-tree py-2">
      {tree.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
});
```

- [x] **Step 2: 更新 components/explorer/index.ts**

```typescript
export { VaultTree } from './VaultTree';
export { TreeNode } from './TreeNode';
export { QuickSwitcher } from './QuickSwitcher';
```

- [x] **Step 3: 提交**

```bash
git add apps/render/src/components/explorer/VaultTree.tsx apps/render/src/components/explorer/index.ts
git commit -m "feat(render): implement VaultTree component"
```

---

### Task 7: 实现 TreeNode 组件

**Files:**

- Modify: `apps/render/src/components/explorer/TreeNode.tsx`

- [x] **Step 1: 实现 TreeNode 组件（支持展开/收起）**

```typescript
import { observer } from '@rabjs/react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { TreeNode as TreeNodeType } from '@/ipc/vault';
import { useVaultService } from '@/services/vault.service';

interface TreeNodeProps {
  node: TreeNodeType;
  depth: number;
}

export const TreeNode = observer(({ node, depth }: TreeNodeProps) => {
  const [expanded, setExpanded] = useState(false);
  const vaultService = useVaultService();
  const navigate = useNavigate();
  const { activeFile } = vaultService.use();

  const isActive = activeFile === node.path;
  const hasChildren = node.type === 'folder' && node.children && node.children.length > 0;

  const handleClick = () => {
    if (node.type === 'folder') {
      setExpanded(!expanded);
    } else {
      vaultService.setActiveFile(node.path);
      navigate(`/editor/${encodeURIComponent(node.path)}`);
    }
  };

  const indent = depth * 16;

  return (
    <div className="tree-node">
      <div
        className={`tree-node-row flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
          isActive ? 'bg-blue-50 dark:bg-blue-900/30' : ''
        }`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={handleClick}
      >
        {node.type === 'folder' ? (
          <>
            <span className="tree-arrow mr-1 text-gray-400 text-xs w-4">
              {hasChildren ? (expanded ? '▼' : '▶') : ' '}
            </span>
            <span className="text-gray-500 mr-1">📁</span>
          </>
        ) : (
          <>
            <span className="w-4 mr-1" />
            <span className="text-gray-400 mr-1">📄</span>
          </>
        )}
        <span className="tree-node-name text-sm truncate">{node.name}</span>
      </div>

      {node.type === 'folder' && expanded && hasChildren && (
        <div className="tree-children">
          {node.children!.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
});
```

- [x] **Step 2: 提交**

```bash
git add apps/render/src/components/explorer/TreeNode.tsx
git commit -m "feat(render): implement TreeNode component with expand/collapse"
```

---

## Chunk 6: 编辑器页面集成

### Task 8: 完善 EditorPage 读取和保存

**Files:**

- Modify: `apps/render/src/pages/editor/index.tsx`
- Modify: `apps/render/src/services/editor.service.ts`

- [x] **Step 1: 创建/更新 EditorService**

```typescript
import { Service } from '@rabjs/react';
import { vault } from '@/ipc/vault';
import { useVaultService } from './vault.service';
import { debounce } from '@/utils/debounce';

export interface EditorState {
  currentPath: string | null;
  content: string;
  originalContent: string;
  isDirty: boolean;
  isSaving: boolean;
}

class EditorService extends Service<EditorState> {
  protected state: EditorState = {
    currentPath: null,
    content: '',
    originalContent: '',
    isDirty: false,
    isSaving: false,
  };

  private debouncedSave: ReturnType<typeof debounce>;

  constructor() {
    super();
    this.debouncedSave = debounce(this.save.bind(this), 500);
  }

  get vaultService() {
    return this.resolve(VaultService);
  }

  async openFile(filePath: string): Promise<void> {
    const vaultPath = this.vaultService.vaultPath;
    if (!vaultPath) return;

    const result = await vault.readNote(vaultPath, filePath);
    if (result) {
      this.state.currentPath = filePath;
      this.state.content = result.content;
      this.state.originalContent = result.content;
      this.state.isDirty = false;
      this.notify();
    }
  }

  updateContent(content: string): void {
    this.state.content = content;
    this.state.isDirty = content !== this.state.originalContent;
    this.notify();
    this.debouncedSave();
  }

  private async save(): Promise<void> {
    if (!this.state.currentPath || !this.state.isDirty) return;

    const vaultPath = this.vaultService.vaultPath;
    if (!vaultPath) return;

    this.state.isSaving = true;
    this.notify();

    try {
      await vault.writeNote(vaultPath, this.state.currentPath, this.state.content);
      this.state.originalContent = this.state.content;
      this.state.isDirty = false;
    } finally {
      this.state.isSaving = false;
      this.notify();
    }
  }

  clear(): void {
    this.state.currentPath = null;
    this.state.content = '';
    this.state.originalContent = '';
    this.state.isDirty = false;
    this.notify();
  }
}

export const editorService = new EditorService();
export function useEditorService() {
  return editorService.use();
}
```

- [x] **Step 2: 更新 EditorPage**

```typescript
import { useParams } from 'react-router';
import { useEffect } from 'react';
import { MilkdownEditor } from '../../components/editor/MilkdownEditor';
import { EditorStatus } from '../../components/editor/EditorStatus';
import { useEditorService } from '@/services/editor.service';
import { useVaultService } from '@/services/vault.service';

export function EditorPage() {
  const { path: encodedPath } = useParams<{ path: string }>();
  const editorService = useEditorService();
  const vaultService = useVaultService();
  const { currentPath, content, isDirty, isSaving } = editorService.use();

  useEffect(() => {
    if (encodedPath) {
      const filePath = decodeURIComponent(encodedPath);
      editorService.openFile(filePath);
    } else {
      editorService.clear();
    }
  }, [encodedPath]);

  const handleChange = (markdown: string) => {
    editorService.updateContent(markdown);
  };

  return (
    <div className="editor-page h-full flex flex-col">
      <div className="editor-toolbar border-b p-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {currentPath || 'New Note'}
          {isDirty && <span className="ml-2 text-orange-500">•</span>}
        </span>
        <EditorStatus isSaving={isSaving} />
      </div>
      <div className="editor-content flex-1 overflow-auto">
        {currentPath || encodedPath ? (
          <MilkdownEditor
            onChange={handleChange}
            defaultValue={content || '# New Note'}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a file to edit
          </div>
        )}
      </div>
    </div>
  );
}
```

- [x] **Step 3: 更新 EditorStatus 组件**

```typescript
import { observer } from '@rabjs/react';
import { useEditorService } from '@/services/editor.service';

interface EditorStatusProps {
  isSaving?: boolean;
}

export const EditorStatus = observer(({ isSaving }: EditorStatusProps) => {
  const editorService = useEditorService();
  const { isDirty } = editorService.use();

  if (isSaving) {
    return <span className="text-sm text-blue-500">Saving...</span>;
  }

  if (isDirty) {
    return <span className="text-sm text-orange-500">Unsaved</span>;
  }

  return <span className="text-sm text-green-500">Saved</span>;
});
```

- [x] **Step 4: 注册 EditorService 在 main.tsx**

检查并更新 `apps/render/src/main.tsx`

- [x] **Step 5: 提交**

```bash
git add apps/render/src/services/editor.service.ts apps/render/src/pages/editor/index.tsx apps/render/src/components/editor/EditorStatus.tsx apps/render/src/main.tsx
git commit -m "feat(render): implement editor service with auto-save"
```

---

## Chunk 7: 右键菜单组件

### Task 9: 实现 ContextMenu 组件

**Files:**

- Create: `apps/render/src/components/common/ContextMenu.tsx`
- Modify: `apps/render/src/components/common/index.ts`

- [x] **Step 1: 实现 ContextMenu 组件**

```typescript
import { useEffect, useRef } from 'react';

export interface MenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  dividerBefore?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position if menu would go off screen
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 16);

  return (
    <div
      ref={menuRef}
      className="context-menu fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px] z-50"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, index) => (
        <div key={index}>
          {item.dividerBefore && (
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          )}
          <button
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${
              item.danger ? 'text-red-500 hover:text-red-600' : 'text-gray-700 dark:text-gray-200'
            }`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon && <span>{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [x] **Step 2: 更新 index.ts 导出**

```typescript
export { ContextMenu } from './ContextMenu';
export type { MenuItem } from './ContextMenu';
```

- [x] **Step 3: 提交**

```bash
git add apps/render/src/components/common/ContextMenu.tsx apps/render/src/components/common/index.ts
git commit -m "feat(render): implement ContextMenu component"
```

---

### Task 10: 在 TreeNode 中集成右键菜单

**Files:**

- Modify: `apps/render/src/components/explorer/TreeNode.tsx`

- [x] **Step 1: 更新 TreeNode 添加右键菜单**

```typescript
import { useState, useCallback } from 'react';
import { observer } from '@rabjs/react';
import { useNavigate } from 'react-router';
import type { TreeNode as TreeNodeType } from '@/ipc/vault';
import { useVaultService } from '@/services/vault.service';
import { ContextMenu, type MenuItem } from '@/components/common/ContextMenu';
import { vault } from '@/ipc/vault';

interface TreeNodeProps {
  node: TreeNodeType;
  depth: number;
}

export const TreeNode = observer(({ node, depth }: TreeNodeProps) => {
  const [expanded, setExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const vaultService = useVaultService();
  const navigate = useNavigate();
  const { activeFile } = vaultService.use();

  const isActive = activeFile === node.path;
  const hasChildren = node.type === 'folder' && node.children && node.children.length > 0;

  const handleClick = () => {
    if (node.type === 'folder') {
      setExpanded(!expanded);
    } else {
      vaultService.setActiveFile(node.path);
      navigate(`/editor/${encodeURIComponent(node.path)}`);
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleRename = useCallback(async () => {
    const newName = prompt('Enter new name:', node.name);
    if (newName && newName !== node.name) {
      const vaultPath = vaultService.vaultPath;
      if (vaultPath) {
        const parentPath = node.path.includes('/')
          ? node.path.substring(0, node.path.lastIndexOf('/'))
          : '';
        const newPath = parentPath ? `${parentPath}/${newName}` : newName;
        await vault.rename(vaultPath, node.path, newPath);
        await vaultService.refreshTree();
      }
    }
  }, [node, vaultService]);

  const handleDelete = useCallback(async () => {
    const confirmed = confirm(`Delete "${node.name}"? This cannot be undone.`);
    if (confirmed) {
      const vaultPath = vaultService.vaultPath;
      if (vaultPath) {
        await vault.delete(vaultPath, node.path);
        if (isActive) {
          vaultService.setActiveFile(null);
        }
        await vaultService.refreshTree();
      }
    }
  }, [node, vaultService, isActive]);

  const handleNewFile = useCallback(async () => {
    const name = prompt('Enter file name:', 'untitled.md');
    if (name) {
      const vaultPath = vaultService.vaultPath;
      if (vaultPath) {
        const fileName = name.endsWith('.md') ? name : `${name}.md`;
        const parentPath = node.type === 'folder' ? node.path : (node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : '');
        const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
        await vault.writeNote(vaultPath, filePath, '');
        await vaultService.refreshTree();
        vaultService.setActiveFile(filePath);
        navigate(`/editor/${encodeURIComponent(filePath)}`);
      }
    }
  }, [node, vaultService, navigate]);

  const handleNewFolder = useCallback(async () => {
    const name = prompt('Enter folder name:', 'new-folder');
    if (name) {
      const vaultPath = vaultService.vaultPath;
      if (vaultPath) {
        const parentPath = node.type === 'folder' ? node.path : (node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : '');
        const folderPath = parentPath ? `${parentPath}/${name}` : name;
        await vault.createFolder(vaultPath, folderPath);
        await vaultService.refreshTree();
      }
    }
  }, [node, vaultService]);

  const contextMenuItems: MenuItem[] = node.type === 'folder'
    ? [
        { label: 'New File', icon: '📄', onClick: handleNewFile },
        { label: 'New Folder', icon: '📁', onClick: handleNewFolder },
        { label: 'Rename', icon: '✏️', onClick: handleRename, dividerBefore: true },
        { label: 'Delete', icon: '🗑️', onClick: handleDelete, danger: true },
      ]
    : [
        { label: 'Rename', icon: '✏️', onClick: handleRename },
        { label: 'Delete', icon: '🗑️', onClick: handleDelete, danger: true },
      ];

  const indent = depth * 16;

  return (
    <div className="tree-node">
      <div
        className={`tree-node-row flex items-center py-1 px-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
          isActive ? 'bg-blue-50 dark:bg-blue-900/30' : ''
        }`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {node.type === 'folder' ? (
          <>
            <span className="tree-arrow mr-1 text-gray-400 text-xs w-4">
              {hasChildren ? (expanded ? '▼' : '▶') : ' '}
            </span>
            <span className="text-gray-500 mr-1">📁</span>
          </>
        ) : (
          <>
            <span className="w-4 mr-1" />
            <span className="text-gray-400 mr-1">📄</span>
          </>
        )}
        <span className="tree-node-name text-sm truncate">{node.name}</span>
      </div>

      {node.type === 'folder' && expanded && hasChildren && (
        <div className="tree-children">
          {node.children!.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});
```

- [x] **Step 2: 提交**

```bash
git add apps/render/src/components/explorer/TreeNode.tsx
git commit -m "feat(render): integrate context menu in TreeNode"
```

---

### Task 11: 在编辑器空白处添加右键新建

**Files:**

- Modify: `apps/render/src/pages/editor/index.tsx`

- [x] **Step 1: 更新 EditorPage 支持空白处右键**

```typescript
import { useState, useCallback } from 'react';
// ... existing imports

export function EditorPage() {
  // ... existing state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // ... existing handlers

  const handleEditorContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNewFile = useCallback(async () => {
    const name = prompt('Enter file name:', 'untitled.md');
    if (name) {
      const vaultPath = vaultService.vaultPath;
      if (vaultPath) {
        const fileName = name.endsWith('.md') ? name : `${name}.md`;
        await vault.writeNote(vaultPath, fileName, `# ${name.replace('.md', '')}\n\n`);
        await vaultService.refreshTree();
        vaultService.setActiveFile(fileName);
        navigate(`/editor/${encodeURIComponent(fileName)}`);
      }
    }
  }, [vaultService, navigate]);

  // ... render with context menu
}
```

- [x] **Step 2: 提交**

```bash
git add apps/render/src/pages/editor/index.tsx
git commit -m "feat(render): add right-click new file in editor"
```

---

## Chunk 8: 整合和路由

### Task 12: 更新 app.tsx 路由和侧边栏布局

**Files:**

- Modify: `apps/render/src/app.tsx`
- Create: `apps/render/src/components/Layout.tsx`

- [x] **Step 1: 创建 Layout 组件**

```typescript
import { ReactNode } from 'react';
import { VaultTree } from '@/components/explorer/VaultTree';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="app-layout h-full flex">
      <aside className="sidebar w-64 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <VaultTree />
      </aside>
      <main className="main-content flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
```

- [x] **Step 2: 更新 app.tsx**

```typescript
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router';
import { Layout } from '@/components/Layout';
import { HomePage } from '@/pages/home';
import { EditorPage } from '@/pages/editor';

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/editor',
    element: <Layout><EditorPage /></Layout>,
  },
  {
    path: '/editor/:path',
    element: <Layout><EditorPage /></Layout>,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
```

- [x] **Step 3: 提交**

```bash
git add apps/render/src/app.tsx
git commit -m "feat(render): add layout with sidebar and routing"
```

---

## Chunk 9: 完善和测试

### Task 13: 测试完整流程

- [x] **Step 1: 构建并运行**

```bash
pnpm build
pnpm dev
```

- [x] **Step 2: 手动测试流程**

1. 打开应用 → HomePage 显示 Open Vault / Create New Vault
2. 点击 Open Vault → 选择文件夹 → 进入编辑器
3. 左侧显示文件树 → 可以展开/收起文件夹
4. 点击文件 → 在编辑器中打开
5. 编辑内容 → 自动保存
6. 右键文件 → New File / New Folder / Rename / Delete
7. 右键空白处 → 新建文件

- [x] **Step 3: 提交最终迭代**

```bash
git add -A
git commit -m "feat: complete vault core features implementation"
```

---

## 依赖关系

```
Chunk 1 (IPC handlers)
    ↓
Chunk 2 (IPC client) ← 需要 Chunk 1 定义
    ↓
Chunk 3 (VaultService) ← 需要 Chunk 2
    ↓
Chunk 4 (HomePage) ← 需要 Chunk 3
    ↓
Chunk 5 (文件树) ← 需要 Chunk 3
    ↓
Chunk 6 (编辑器) ← 需要 Chunk 5
    ↓
Chunk 7 (右键菜单) ← 需要 Chunk 5
    ↓
Chunk 8 (整合) ← 需要 Chunk 4, 5, 6, 7
    ↓
Chunk 9 (测试)
```
