# Obsidian 双链功能实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Obsidian 风格的完整双向链接系统，包括 Graph 模块、IPC 层、Wiki-link Milkdown 插件、Backlinks 面板和知识图谱。

**Architecture:**
- `packages/core` 实现 Graph 类（邻接表），提供 `buildFromNotes`/`getGraphData`/`getBacklinks`/`getOutlinks`
- `apps/client` 实现 IPC handlers，调用 core 并做 renderer 类型适配
- `apps/render` 实现 Milkdown wiki-link 插件、BacklinksPanel 和 GraphView
- 数据流：editor → vault → graph → IPC → renderer → UI

**Tech Stack:** TypeScript, vitest (core 测试), Milkdown v7 (自定义 Node/InputRule), D3.js v7 (已有)

---

## Chunk 1: packages/core — Graph 模块

> 核心依赖层。后续所有功能都依赖它。必须先完成且测试通过。

**Files:**
- Create: `packages/core/vitest.config.ts`
- Modify: `packages/core/package.json` (添加 vitest devDependencies + test script)
- Create: `packages/core/src/graph/graph.ts` (Graph 类实现)
- Modify: `packages/core/src/graph/index.ts` (添加 getGraphData 到接口)
- Modify: `packages/core/src/graph/extractor.ts` (更新正则支持 alias/embed)
- Modify: `packages/core/src/index.ts` (导出 resolveLink)
- Create: `packages/core/src/graph/graph.test.ts`

### Task 1.1: 初始化 vitest 测试框架

- [ ] **Step 1: 添加 vitest 到 devDependencies**

  ```bash
  cd packages/core
  pnpm add -D vitest @vitest/ui
  ```

- [ ] **Step 2: 创建 vitest.config.ts**

  ```typescript
  // packages/core/vitest.config.ts
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      globals: true,
      environment: 'node',
    },
  });
  ```

- [ ] **Step 3: 更新 package.json scripts**

  ```json
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
  ```

- [ ] **Step 4: 提交**

  ```bash
  git add packages/core/package.json packages/core/vitest.config.ts
  git commit -m "feat(core): add vitest for unit testing"
  ```

### Task 1.2: 更新 extractor.ts — 支持 alias 和 embed 拆分

- [ ] **Step 1: 更新正则，添加 extractWikiLinks 函数**

  ```typescript
  // packages/core/src/graph/extractor.ts

  // 匹配 [[target]] 或 [[target|alias]]，排除 ![[（嵌入语法另处理）
  // 不匹配 [[target#block-id]]（块引用本版本不支持，[^\]|] 排除了 # 和 |）
  const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g;

  // 匹配 ![[target]] 或 ![[target|alias]]
  const EMBED_REGEX = /!\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g;

  const TAG_REGEX = /#([a-zA-Z0-9_-]+)/g;

  export interface ParsedLink {
    target: string;   // 链接目标（如 "笔记名"）
    alias: string;    // 别名（如 "显示文本"，无别名时等于 target）
    isEmbed: boolean; // 是否为嵌入语法
  }

  export function extractWikiLinks(body: string): ParsedLink[] {
    const links: ParsedLink[] = [];

    // 提取 ![[ 嵌入
    let match;
    const embedRegex = /!\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g;
    while ((match = embedRegex.exec(body)) !== null) {
      links.push({
        target: match[1],
        alias: match[2] ?? match[1],
        isEmbed: true,
      });
    }

    // 提取 [[ 普通链接（排除已匹配的 ![[ 位置）
    const linkRegex = /\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g;
    while ((match = linkRegex.exec(body)) !== null) {
      links.push({
        target: match[1],
        alias: match[2] ?? match[1],
        isEmbed: false,
      });
    }

    return links;
  }

  // 保持向后兼容：extractLinks 返回纯 target 列表（给 graph 构建用）
  export function extractLinks(body: string): string[] {
    const links: string[] = [];
    const seen = new Set<string>();
    const regex = /\[\[([^\]|]+)\]\]/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
      // ![[ 也会被匹配但 ! 在 [^]|] 之外不会匹配，所以 ![[target]] 不会匹配到这个 regex
      // 但为安全起见，过滤掉 embed 的情况
      const before = body.slice(Math.max(0, match.index - 1), match.index);
      if (before === '!') continue; // 跳过 ![[
      if (!seen.has(match[1])) {
        links.push(match[1]);
        seen.add(match[1]);
      }
    }
    return links;
  }

  export function extractTags(body: string): string[] {
    const tags: string[] = [];
    let match;
    while ((match = TAG_REGEX.exec(body)) !== null) {
      tags.push(match[1]);
    }
    return tags;
  }
  ```

  > 注意：`!\[\[` 的 `!` 在 regex `/\[\[([^\]|]+).../` 中不会被匹配（`[` 是特殊字符但前面有 `!`），`!` 在 `[[` 之前不会进入字符类 `[^\]|]`。但 `extractLinks` 用 `before === '!'` 额外过滤 `![[` 情况。

- [ ] **Step 2: 验证 extractLinks 向后兼容**

  ```bash
  cd packages/core && pnpm test:run
  ```
  预期：PASS（无现有测试则通过）

- [ ] **Step 3: 提交**

  ```bash
  git add packages/core/src/graph/extractor.ts
  git commit -m "feat(core): update extractor regex to handle alias and embed syntax"
  ```

### Task 1.3: 实现 resolveLink 函数

- [ ] **Step 1: 在 core/index.ts 添加 resolveLink**

  ```typescript
  // packages/core/src/index.ts

  // 标准化路径：去扩展名，统一斜杠
  function normalizePath(p: string): string {
    return p.replace(/\.mdx?$/, '').replace(/\\/g, '/');
  }

  /**
   * 解析 wiki-link target，返回匹配的笔记路径。
   * - Step 1: 精确匹配
   * - Step 2: 模糊匹配（忽略大小写）
   * - Step 3: 部分匹配（末路径段匹配，如 [[笔记]] 匹配 "子目录/笔记"）
   * - 返回 null 表示断链
   */
  export function resolveLink(
    linkText: string,
    allNotePaths: string[]
  ): string | null {
    const candidates = allNotePaths.map(normalizePath);
    const normalized = linkText.replace(/\\/g, '/');

    // Step 1: 精确匹配
    const exact = candidates.find(c => c === normalized);
    if (exact) return exact;

    // Step 2: 模糊匹配（忽略大小写）
    const lc = normalized.toLowerCase();
    const fuzzy = candidates.find(c => c.toLowerCase() === lc);
    if (fuzzy) return fuzzy;

    // Step 3: 部分匹配（末路径段匹配）
    const partial = candidates.filter(c => {
      const lcFull = c.toLowerCase();
      const lastSegment = lcFull.split('/').pop()!;
      return lastSegment === lc || lcFull.includes(lc);
    });
    return partial[0] ?? null;
  }
  ```

- [ ] **Step 2: 提交**

  ```bash
  git add packages/core/src/index.ts
  git commit -m "feat(core): add resolveLink function with exact→fuzzy→partial matching"
  ```

### Task 1.4: 实现 Graph 类

- [ ] **Step 1: 更新 graph/index.ts 接口**

  ```typescript
  // packages/core/src/graph/index.ts

  export interface Graph {
    buildFromNotes(notes: { path: string; body: string }[]): GraphData;
    getGraphData(): GraphData;              // ← 新增：返回完整图数据
    getBacklinks(path: string): string[];    // 返回链接到 path 的笔记路径列表
    getOutlinks(path: string): string[];    // 返回 path 中所有外链目标路径列表
  }
  ```

- [ ] **Step 2: 创建 graph.ts 实现**

  ```typescript
  // packages/core/src/graph/graph.ts

  import type { Graph, GraphData, GraphNode, GraphEdge } from './index';
  import { extractLinks } from './extractor';

  function normalizePath(p: string): string {
    return p.replace(/\.mdx?$/, '').replace(/\\/g, '/');
  }

  /**
   * 单例 Graph 实例。
   * 维护内部邻接表，供 getBacklinks/getOutlinks/getGraphData 查询。
   */
  class GraphImpl implements Graph {
    // 笔记节点集合（用于 getGraphData）
    private nodes: Map<string, GraphNode> = new Map();

    // 邻接表：source path → target path[]（outlinks）
    private outlinks: Map<string, Set<string>> = new Map();

    // 反向索引：target path → source path[]（backlinks）
    private backlinks: Map<string, Set<string>> = new Map();

    buildFromNotes(notes: { path: string; body: string }[]): GraphData {
      // 清空已有数据
      this.nodes.clear();
      this.outlinks.clear();
      this.backlinks.clear();

      for (const { path, body } of notes) {
        const normalized = normalizePath(path);

        // 添加节点
        this.nodes.set(normalized, { id: normalized, path: normalized });

        // 提取链接
        const links = extractLinks(body);
        for (const linkTarget of links) {
          const resolved = normalizePath(linkTarget);

          // 跳过自链
          if (resolved === normalized) continue;

          // 记录 outlink
          if (!this.outlinks.has(normalized)) {
            this.outlinks.set(normalized, new Set());
          }
          this.outlinks.get(normalized)!.add(resolved);

          // 记录 backlink（反向）
          if (!this.backlinks.has(resolved)) {
            this.backlinks.set(resolved, new Set());
          }
          this.backlinks.get(resolved)!.add(normalized);

          // 确保目标节点存在（即使没有内容也可以是链接目标）
          if (!this.nodes.has(resolved)) {
            this.nodes.set(resolved, { id: resolved, path: resolved });
          }
        }
      }

      return this.getGraphData();
    }

    getGraphData(): GraphData {
      return {
        nodes: Array.from(this.nodes.values()),
        edges: this.buildEdges(),
      };
    }

    getBacklinks(path: string): string[] {
      const normalized = normalizePath(path);
      const bl = this.backlinks.get(normalized);
      return bl ? Array.from(bl) : [];
    }

    getOutlinks(path: string): string[] {
      const normalized = normalizePath(path);
      const ol = this.outlinks.get(normalized);
      return ol ? Array.from(ol) : [];
    }

    private buildEdges(): GraphEdge[] {
      const edges: GraphEdge[] = [];
      for (const [source, targets] of this.outlinks.entries()) {
        for (const target of targets) {
          edges.push({ source, target });
        }
      }
      return edges;
    }
  }

  // 单例导出
  export const graph: Graph = new GraphImpl();
  ```

- [ ] **Step 3: 更新 graph/index.ts 导出**

  确保导出 graph 实例：

  ```typescript
  export { graph } from './graph';
  ```

- [ ] **Step 4: 提交**

  ```bash
  git add packages/core/src/graph/graph.ts packages/core/src/graph/index.ts
  git commit -m "feat(core): implement Graph class with adjacency table"
  ```

### Task 1.5: 编写 Graph 类单元测试

- [ ] **Step 1: 编写测试文件**

  ```typescript
  // packages/core/src/graph/graph.test.ts

  import { describe, it, expect, beforeEach } from 'vitest';
  import { graph } from './graph';

  describe('Graph', () => {
    beforeEach(() => {
      // 每个测试独立，不依赖单例状态
    });

    it('extracts outlinks and backlinks from notes', () => {
      const notes = [
        { path: '笔记A.md', body: '这是一段文字[[笔记B]]和[[笔记C]]。' },
        { path: '笔记B.md', body: '[[笔记A]]链接回A。' },
        { path: '笔记C.md', body: '无链接。' },
      ];

      graph.buildFromNotes(notes);

      // 笔记A的outlinks
      const aOutlinks = graph.getOutlinks('笔记A.md');
      expect(aOutlinks).toContain('笔记B');
      expect(aOutlinks).toContain('笔记C');

      // 笔记B的backlinks（应包含A）
      const bBacklinks = graph.getBacklinks('笔记B.md');
      expect(bBacklinks).toContain('笔记A');

      // 笔记C的backlinks
      const cBacklinks = graph.getBacklinks('笔记C.md');
      expect(cBacklinks).toContain('笔记A');
    });

    it('filters self-links', () => {
      const notes = [
        { path: '自链笔记.md', body: '[[自链笔记]]这是自链。' },
      ];

      graph.buildFromNotes(notes);

      const backlinks = graph.getBacklinks('自链笔记.md');
      const outlinks = graph.getOutlinks('自链笔记.md');
      expect(backlinks).toHaveLength(0); // 自链不过滤进backlinks
      expect(outlinks).toHaveLength(0);  // 自链不过滤进outlinks
    });

    it('normalizes paths (backslash, extension)', () => {
      const notes = [
        { path: '父目录\\笔记.md', body: '[[子目录\\笔记]]' },
        { path: '子目录/笔记.md', body: '' },
      ];

      graph.buildFromNotes(notes);

      const backlinks = graph.getBacklinks('子目录/笔记');
      expect(backlinks).toContain('父目录/笔记');
    });

    it('returns empty arrays for notes with no links', () => {
      const notes = [{ path: '孤岛笔记.md', body: '没有任何链接。' }];
      graph.buildFromNotes(notes);

      expect(graph.getOutlinks('孤岛笔记.md')).toHaveLength(0);
      expect(graph.getBacklinks('孤岛笔记.md')).toHaveLength(0);
    });

    it('builds correct graph data structure', () => {
      const notes = [
        { path: 'A.md', body: '[[B]]' },
        { path: 'B.md', body: '[[A]]' },
      ];

      const data = graph.buildFromNotes(notes);

      expect(data.nodes.length).toBeGreaterThanOrEqual(2);
      expect(data.edges.some(e => e.source === 'A' && e.target === 'B')).toBe(true);
      expect(data.edges.some(e => e.source === 'B' && e.target === 'A')).toBe(true);
    });
  });
  ```

- [ ] **Step 2: 运行测试验证**

  ```bash
  cd packages/core && pnpm test:run
  ```
  预期：5 PASS

- [ ] **Step 3: 提交**

  ```bash
  git add packages/core/src/graph/graph.test.ts
  git commit -m "test(core): add Graph class unit tests"
  ```

### Task 1.6: 编写 resolveLink 单元测试

- [ ] **Step 1: 编写 resolveLink 测试**

  ```typescript
  // packages/core/src/resolve-link.test.ts

  import { describe, it, expect } from 'vitest';
  import { resolveLink } from './index';

  describe('resolveLink', () => {
    const allNotes = [
      '笔记A.md',
      '子目录/笔记B.md',
      '笔记C.mdx',
    ];

    it('returns exact match', () => {
      expect(resolveLink('笔记A', allNotes)).toBe('笔记A');
      expect(resolveLink('笔记C', allNotes)).toBe('笔记C');
    });

    it('returns exact match without extension', () => {
      expect(resolveLink('笔记A.md', allNotes)).toBe('笔记A');
    });

    it('returns fuzzy match (case insensitive)', () => {
      expect(resolveLink('笔记a', allNotes)).toBe('笔记A');
    });

    it('matches last path segment (partial match)', () => {
      expect(resolveLink('笔记B', allNotes)).toBe('子目录/笔记B');
    });

    it('returns null for broken link', () => {
      expect(resolveLink('不存在的笔记', allNotes)).toBeNull();
    });

    it('normalizes backslashes', () => {
      expect(resolveLink('子目录\\笔记B', allNotes)).toBe('子目录/笔记B');
    });
  });
  ```

- [ ] **Step 2: 运行测试验证**

  ```bash
  cd packages/core && pnpm test:run
  ```
  预期：6 PASS

- [ ] **Step 3: 提交**

  ```bash
  git add packages/core/src/resolve-link.test.ts
  git commit -m "test(core): add resolveLink unit tests"
  ```

---

## Chunk 2: apps/client IPC + apps/render graph service

> 把 core Graph 数据通过 IPC 传到 renderer，并填充 GraphService。

**Files:**
- Modify: `apps/client/src/preload/index.ts` (添加 graph API)
- Modify: `apps/client/src/main/ipc/handlers.ts` (实现 graph handlers)
- Modify: `apps/render/src/ipc/graph.ts` (填充 IPC 调用)
- Modify: `apps/render/src/services/graph.service.ts` (填充数据 + 监听逻辑)
- Modify: `apps/render/src/ipc/index.ts` (导出 graph)

### Task 2.1: 添加 preload graph API

- [ ] **Step 1: 在 preload/index.ts 添加 graph 部分**

  在 `contextBridge.exposeInMainWorld('electronAPI', {` 的 vault 块之后添加：

  ```typescript
  // Graph operations
  graph: {
    build: (notes: { path: string; body: string }[]) =>
      ipcRenderer.invoke('graph:build', notes),
    getGraphData: () =>
      ipcRenderer.invoke('graph:getGraphData'),
    getBacklinks: (noteId: string) =>
      ipcRenderer.invoke('graph:getBacklinks', noteId),
    getOutlinks: (noteId: string) =>
      ipcRenderer.invoke('graph:getOutlinks', noteId),
  },
  ```

  在 `declare global { interface Window { electronAPI: {...} } }` 中的 search 块之后添加：

  ```typescript
  // Graph operations
  graph: {
    build: (notes: { path: string; body: string }[]) => Promise<void>;
    getGraphData: () => Promise<{
      nodes: { id: string; path: string }[];
      edges: { source: string; target: string }[];
    }>;
    getBacklinks: (noteId: string) => Promise<string[]>;
    getOutlinks: (noteId: string) => Promise<string[]>;
  };
  ```

- [ ] **Step 2: 提交**

  ```bash
  git add apps/client/src/preload/index.ts
  git commit -m "feat(preload): expose graph IPC channels to renderer"
  ```

### Task 2.2: 实现 apps/client IPC handlers

- [ ] **Step 1: 在 handlers.ts 实现 graph handlers**

  首先确认文件顶部有 core 导入（检查是否已有 `@aimo-note/core` 导入）：

  ```typescript
  import { graph } from '@aimo-note/core/graph';
  import { resolveLink } from '@aimo-note/core';
  ```

  替换现有的 graph stub handlers：

  ```typescript
  // Graph handlers
  ipcMain.handle('graph:build', async (_event, notes: { path: string; body: string }[]) => {
    console.log('[IPC] graph:build', notes.length, 'notes');
    try {
      graph.buildFromNotes(notes);
      return { success: true };
    } catch (err) {
      console.error('[IPC] graph:build error', err);
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle('graph:getGraphData', async () => {
    console.log('[IPC] graph:getGraphData');
    try {
      return graph.getGraphData();
    } catch (err) {
      console.error('[IPC] graph:getGraphData error', err);
      return { nodes: [], edges: [] };
    }
  });

  ipcMain.handle('graph:getBacklinks', async (_event, noteId: string) => {
    console.log('[IPC] graph:getBacklinks', noteId);
    try {
      return graph.getBacklinks(noteId);
    } catch (err) {
      console.error('[IPC] graph:getBacklinks error', err);
      return [];
    }
  });

  ipcMain.handle('graph:getOutlinks', async (_event, noteId: string) => {
    console.log('[IPC] graph:getOutlinks', noteId);
    try {
      return graph.getOutlinks(noteId);
    } catch (err) {
      console.error('[IPC] graph:getOutlinks error', err);
      return [];
    }
  });
  ```

- [ ] **Step 2: 提交**

  ```bash
  git add apps/client/src/main/ipc/handlers.ts
  git commit -m "feat(client): implement graph IPC handlers using @aimo-note/core"
  ```

### Task 2.3: 填充 apps/render IPC wrapper

- [ ] **Step 1: 更新 graph.ts IPC wrapper**

  ```typescript
  // apps/render/src/ipc/graph.ts

  import type { GraphData } from '../types/graph';

  export interface Graph {
    build(notes: { path: string; body: string }[]): Promise<void>;
    getGraphData(): Promise<GraphData>;
    getBacklinks(noteId: string): Promise<string[]>;
    getOutlinks(noteId: string): Promise<string[]>;
  }

  export const graph: Graph = {
    async build(notes) {
      await window.electronAPI.graph.build(notes);
    },
    async getGraphData() {
      return window.electronAPI.graph.getGraphData();
    },
    async getBacklinks(noteId) {
      return window.electronAPI.graph.getBacklinks(noteId);
    },
    async getOutlinks(noteId) {
      return window.electronAPI.graph.getOutlinks(noteId);
    },
  };
  ```

- [ ] **Step 2: 检查并更新 ipc/index.ts**

  ```bash
  cat apps/render/src/ipc/index.ts
  ```

  确认 graph 导出存在，若无则添加：

  ```typescript
  export * from './graph';
  ```

- [ ] **Step 3: 提交**

  ```bash
  git add apps/render/src/ipc/graph.ts
  git commit -m "feat(render): wire graph IPC calls to window.electronAPI"
  ```

### Task 2.4: 填充 GraphService 并集成 vault 变化监听

- [ ] **Step 1: 更新 GraphService**

  ```typescript
  // apps/render/src/services/graph.service.ts

  import { Service, resolve } from '@rabjs/react';
  import type { GraphData } from '../types/graph';
  import { graph as graphIPC } from '../ipc/graph';
  import { VaultService } from './vault.service'; // 确保 VaultService 已导入

  export class GraphService extends Service {
    data: GraphData = { nodes: [], edges: [] };
    selectedNode: string | null = null;
    viewState = { zoom: 1, pan: { x: 0, y: 0 } };

    private get vaultService(): VaultService {
      return this.resolve(VaultService);
    }

    /**
     * 全量构建图谱。在 vault 首次打开时调用。
     */
    async buildGraph() {
      const { vaultPath } = this.vaultService;
      if (!vaultPath) return;

      try {
        const tree = await this.getNoteTree();
        const notes = await this.loadAllNotes(tree);
        await graphIPC.build(notes);
        this.data = await graphIPC.getGraphData();
      } catch (err) {
        console.error('[GraphService] buildGraph error', err);
      }
    }

    /**
     * 增量更新：单个笔记变化时调用。
     */
    async updateNote(path: string, body: string) {
      try {
        // 先移除旧边（重新构建受影响笔记的边）
        // 简化策略：直接重新构建全量图（对于小到中型 vault 可接受）
        // TODO: 后续优化为真正的增量更新
        await this.buildGraph();
      } catch (err) {
        console.error('[GraphService] updateNote error', err);
      }
    }

    /**
     * 拉取指定笔记的 backlinks。
     */
    async getBacklinks(noteId: string): Promise<string[]> {
      try {
        return await graphIPC.getBacklinks(noteId);
      } catch (err) {
        console.error('[GraphService] getBacklinks error', err);
        return [];
      }
    }

    /**
     * 获取图谱数据。
     */
    async getGraphData(): Promise<GraphData> {
      try {
        return await graphIPC.getGraphData();
      } catch (err) {
        console.error('[GraphService] getGraphData error', err);
        return { nodes: [], edges: [] };
      }
    }

    selectNode(nodeId: string | null) {
      this.selectedNode = nodeId;
    }

    // --- 内部辅助方法 ---

    private async getNoteTree(): Promise<{ path: string; type: string }[]> {
      const result = await window.electronAPI.vault.list(this.vaultService.vaultPath);
      if (!result.tree) return [];
      return this.flattenTree(result.tree);
    }

    private flattenTree(nodes: { path: string; type: string; children?: { path: string; type: string; children?: unknown[] }[] }[]): { path: string; type: string }[] {
      const flat: { path: string; type: string }[] = [];
      for (const node of nodes) {
        if (node.type === 'file' && node.path.endsWith('.md') || node.path.endsWith('.mdx')) {
          flat.push({ path: node.path, type: node.type });
        }
        if (node.children) {
          flat.push(...this.flattenTree(node.children as { path: string; type: string; children?: unknown[] }[]));
        }
      }
      return flat;
    }

    private async loadAllNotes(files: { path: string; type: string }[]): Promise<{ path: string; body: string }[]> {
      const notes: { path: string; body: string }[] = [];
      for (const file of files) {
        if (file.type !== 'file') continue;
        const result = await window.electronAPI.vault.readNote(this.vaultService.vaultPath, file.path);
        if (result.content !== undefined) {
          notes.push({ path: file.path, body: result.content });
        }
      }
      return notes;
    }
  }

  export function useGraphService(): GraphService {
    return resolve(GraphService);
  }
  ```

- [ ] **Step 2: 提交**

  ```bash
  git add apps/render/src/services/graph.service.ts
  git commit -m "feat(render): populate GraphService with IPC calls and vault integration"
  ```

---

## Chunk 3: apps/render — Wiki-link Milkdown 插件

> 在 Milkdown 编辑器中实现 `[[]]` 语法渲染和编辑体验。

**Files:**
- Create: `apps/render/src/components/editor/plugins/wiki-link/plugin.ts` (Milkdown plugin)
- Create: `apps/render/src/components/editor/plugins/wiki-link/index.ts` (导出)
- Modify: `apps/render/src/components/editor/MilkdownEditorInner.tsx` (注册插件)
- Create: `apps/render/src/styles/wiki-link.css` (wiki-link 样式)

### Task 3.1: 创建 wiki-link Milkdown plugin

- [ ] **Step 1: 创建插件目录结构**

  ```bash
  mkdir -p apps/render/src/components/editor/plugins/wiki-link
  ```

- [ ] **Step 2: 创建 plugin.ts**

  需要使用 Milkdown v7 API。确认 Milkdown 版本：

  ```bash
  grep '"@milkdown/core"' apps/render/package.json
  ```

  创建插件文件（Milkdown v7 语法）：

  ```typescript
  // apps/render/src/components/editor/plugins/wiki-link/plugin.ts

  import { createPlugin, nodeViewFactory } from '@milkdown/core';
  import {
    InputRule,
    callCommand,
    toggleEmphasisCommand,
  } from '@milkdown/core';
  import { Node, nodeInputRule } from '@milkdown/prose';
  import { useEditor } from '@milkdown/react';
  import { Ctx, editorViewOptions, editorView } from '@milkdown/core';
  import { Plugin, PluginKey } from '@milkdown/prose/state';
  import { Decoration, DecorationSet } from '@milkdown/prose/view';

  // --- Schema 定义 ---

  const wikiLinkMarkdown = 'wikiLink';

  const wikiLinkPlugin = createPlugin((ctx: Ctx) => {
    // 1. 注册 wikiLink Node schema（通过增强现有 link 或新建 node）
    // Milkdown v7 中，我们用自定义 Mark 来处理 [[]] 渲染

    // 使用 InputRule 自动补全 [[]]
    ctx.get(editorViewOptions).hook('handleKeyDown', (view, event) => {
      if (event.key === '[') {
        const { state } = view;
        const { selection } = state;
        const { $from } = selection;
        const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);

        // 检测 [[ 输入
        if (textBefore.endsWith('[')) {
          // 自动补全 ]]
          const tr = state.tr.insertText(']]', selection.from);
          view.dispatch(tr);
          // 将光标移到中间
          const newPos = selection.from + 1;
          const setSelection = state.tr.setSelection(
            state.selection.constructor.near(state.doc.resolve(newPos))
          );
          view.dispatch(setSelection);
          return true;
        }
      }
      return false;
    });

    return {};
  });

  export { wikiLinkPlugin };

  // --- NodeView React 组件用于渲染 wiki-link ---

  export class WikiLinkNodeView {
    // TODO: 实现完整 NodeView
    // 需要用 ProseMirror 的 NodeView 渲染 [[]] 为可点击 span
  }
  ```

  > ⚠️ Milkdown v7 的 plugin API 比较复杂。这个 Task 是最难的子任务之一。
  >
  > **替代方案（更简单）**：用 markdown-it 预处理方式，把 `[[笔记]]` 在 Markdown 解析前转成 `<a>` 标签。
  >
  > **推荐**：先用替代方案快速上线核心功能，再逐步迁移到完整 Milkdown 插件。

  **替代方案实施（推荐先做这个）：**

  创建文件 `apps/render/src/components/editor/plugins/wiki-link/preprocess.ts`：

  ```typescript
  // apps/render/src/components/editor/plugins/wiki-link/preprocess.ts

  /**
   * 将 [[笔记]] 和 [[笔记|别名]] 转换为 Markdown link 格式，
   * 让 Milkdown 的标准 link parser 处理。
   *
   * [[笔记]]         → [笔记](wiki://笔记)
   * [[笔记|显示文本]] → [显示文本](wiki://笔记)
   * ![[笔记]]        → <embed data-wiki-target="笔记"></embed>
   */
  export function preprocessWikiLinks(content: string): string {
    // 嵌入语法：![[target|alias]] → <embed data-target="target" data-alias="alias"></embed>
    let result = content.replace(
      /!\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g,
      (_match, target, alias) => {
        return `<embed data-wiki-target="${target}" data-wiki-alias="${alias ?? target}"></embed>`;
      }
    );

    // 普通链接：[[target|alias]] → [alias](wiki://target)
    result = result.replace(
      /\[\[([^\]|]+)\|([^\]]+)\]\]/g,
      (_match, target, alias) => {
        return `[${alias}](wiki://${target})`;
      }
    );

    // 无别名链接：[[target]] → [target](wiki://target)
    // 使用负向前瞻确保不匹配 ![[
    result = result.replace(
      /(?<!\!)\[\[([^\]|]+)\]\]/g,
      (_match, target) => {
        return `[${target}](wiki://${target})`;
      }
    );

    return result;
  }

  /**
   * 还原函数：将 wiki:// URL 转回显示文本（用于编辑时）
   */
  export function postprocessWikiLinks(content: string): string {
    return content;
  }
  ```

- [ ] **Step 2: 在 MilkdownEditorInner 中集成预处理**

  修改 `MilkdownEditorInner.tsx` 的 `useEditor` 块中 `defaultValueCtx` 设置之前，添加预处理：

  ```typescript
  import { preprocessWikiLinks } from './plugins/wiki-link/preprocess';

  // 在传递给 Milkdown 的 defaultValue 上预处理
  const processedDefaultValue = useMemo(() => {
    return preprocessWikiLinks(defaultValueRef.current ?? '');
  }, [defaultValueRef.current]);
  ```

  并在 `ctx.set(defaultValueCtx, defaultValueRef.current)` 改为：

  ```typescript
  ctx.set(defaultValueCtx, processedDefaultValue);
  ```

  同时在 `onChange` 回调中，当内容变化时预处理后传给上层：

  ```typescript
  listener.markdown((ctx) => {
    const markdown = ctx.get(consumerCtx);
    const processed = postprocessWikiLinks(markdown);
    onChange?.(processed);
  })
  ```

- [ ] **Step 3: 提交**

  ```bash
  git add apps/render/src/components/editor/plugins/wiki-link/
  git commit -m "feat(editor): add wiki-link preprocessing for Milkdown"
  ```

### Task 3.2: Wiki-link 样式

- [ ] **Step 1: 创建 wiki-link 样式**

  ```css
  /* apps/render/src/styles/wiki-link.css */

  /* 普通 wiki-link */
  .wiki-link {
    color: var(--color-link, #4a9eff);
    cursor: pointer;
    text-decoration: none;
    border-bottom: 1px solid currentColor;
    transition: opacity 0.15s;
  }

  .wiki-link:hover {
    opacity: 0.8;
  }

  /* 断链样式 */
  .wiki-link--broken {
    color: var(--color-broken-link, #e74c3c);
    border-bottom: 1px dashed currentColor;
  }

  /* 嵌入块 */
  .embed-block {
    border: 1px solid var(--color-border, #3a3a3a);
    border-radius: 6px;
    margin: 8px 0;
    background: var(--color-surface-elevated, #2a2a2a);
    overflow: hidden;
  }

  .embed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background: var(--color-surface-hover, #333);
    border-bottom: 1px solid var(--color-border, #3a3a3a);
    cursor: pointer;
  }

  .embed-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text, #e0e0e0);
  }

  .embed-placeholder {
    padding: 12px 16px;
    font-size: 13px;
    color: var(--color-text-secondary, #888);
  }

  .embed-content {
    padding: 12px 16px;
    font-size: 14px;
  }
  ```

- [ ] **Step 2: 在 main.tsx 或 styles/index.css 中引入**

  ```typescript
  // 在 apps/render/src/styles/index.css 中添加：
  @import './wiki-link.css';
  ```

- [ ] **Step 3: 提交**

  ```bash
  git add apps/render/src/styles/wiki-link.css apps/render/src/styles/index.css
  git commit -m "feat(editor): add wiki-link and embed CSS styles"
  ```

### Task 3.3: Wiki-link 点击跳转（编辑器交互）

- [ ] **Step 1: 在 MilkdownEditorInner 中添加链接点击处理**

  在 `useEditor` 的配置中，添加 editorView 的 link 点击拦截：

  ```typescript
  // 在 useEditor 的 config 回调中添加：
  ctx.get(editorViewOptions).hook('handleClick', (_view, _pos, event) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return false;

    const href = anchor.getAttribute('href');
    if (href?.startsWith('wiki://')) {
      event.preventDefault();
      const noteName = decodeURIComponent(href.replace('wiki://', ''));
      // 调用 editorService 打开目标笔记
      editorService.openNoteByName(noteName);
      return true;
    }
    return false;
  });
  ```

  > ⚠️ `editorService.openNoteByName` 如果不存在，需要先在 `editor.service.ts` 中添加该方法。

- [ ] **Step 2: 提交**

  ```bash
  git add apps/render/src/components/editor/MilkdownEditorInner.tsx
  git commit -m "feat(editor): handle wiki-link clicks to navigate to target notes"
  ```

---

## Chunk 4: apps/render — Backlinks Panel

> 实现侧边栏 Backlinks 面板，显示当前笔记的反向链接和上下文片段。

**Files:**
- Modify: `apps/render/src/components/side-panel/SidePanel.tsx` (实现 BacklinksPanel)
- Modify: `apps/render/src/components/side-panel/BacklinksPanel.tsx` (新建 BacklinksPanel 组件)

### Task 4.1: 创建 BacklinksPanel 组件

- [ ] **Step 1: 创建 BacklinksPanel.tsx**

  ```typescript
  // apps/render/src/components/side-panel/BacklinksPanel.tsx

  import { observer } from '@rabjs/react';
  import { useService } from '@rabjs/react';
  import { useEffect, useState } from 'react';
  import { GraphService } from '../../services/graph.service';
  import { EditorService } from '../../services/editor.service';

  export interface BacklinkItem {
    sourcePath: string;
    sourceTitle: string;
    contextBefore: string;
    contextAfter: string;
    matchedLink: string;
  }

  export const BacklinksPanel = observer(() => {
    const graphService = useGraphService();
    const editorService = useService(EditorService);
    const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);
    const [loading, setLoading] = useState(false);

    const currentNotePath = editorService.currentNote?.path;

    useEffect(() => {
      if (!currentNotePath) {
        setBacklinks([]);
        return;
      }

      setLoading(true);
      graphService.getBacklinks(currentNotePath).then(async (sourcePaths) => {
        if (sourcePaths.length === 0) {
          setBacklinks([]);
          setLoading(false);
          return;
        }

        // 对每个 source note 读取内容，提取上下文片段
        const items: BacklinkItem[] = [];
        for (const sourcePath of sourcePaths) {
          const result = await window.electronAPI.vault.readNote(
            graphService.vaultPath,
            sourcePath
          );
          if (!result.content) continue;

          const contexts = extractContexts(result.content, currentNotePath);
          for (const ctx of contexts) {
            items.push({
              sourcePath,
              sourceTitle: getNoteTitle(sourcePath),
              ...ctx,
            });
          }
        }

        setBacklinks(items);
        setLoading(false);
      });
    }, [currentNotePath]);

    if (loading) {
      return <div className="text-sm text-text-secondary p-3">Loading...</div>;
    }

    if (backlinks.length === 0) {
      return (
        <div className="text-sm text-text-secondary p-3">
          No backlinks yet
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 p-3">
        {backlinks.map((item, idx) => (
          <div
            key={`${item.sourcePath}-${idx}`}
            className="cursor-pointer p-2 rounded hover:bg-surface-hover transition-colors"
            onClick={() => editorService.openNote(item.sourcePath)}
          >
            <div className="text-sm font-medium text-link mb-1">
              {item.sourceTitle}
            </div>
            <div className="text-xs text-text-secondary">
              <span className="text-text-tertiary">{item.contextBefore}</span>
              <mark className="bg-highlight px-0.5 rounded">{item.matchedLink}</mark>
              <span className="text-text-tertiary">{item.contextAfter}</span>
            </div>
          </div>
        ))}
      </div>
    );
  });

  // --- 辅助函数 ---

  function getNoteTitle(path: string): string {
    const name = path.split('/').pop() ?? path;
    return name.replace(/\.mdx?$/, '');
  }

  /**
   * 在 body 中定位 [[target]] 的所有出现位置，
   * 提取前后各 50 个字符的上下文。
   */
  function extractContexts(
    body: string,
    targetPath: string
  ): { contextBefore: string; contextAfter: string; matchedLink: string }[] {
    const targetName = getNoteTitle(targetPath);
    const linkPattern = new RegExp(
      `\\[\\[${escapeRegex(targetName)}(?:\\|[^\\]]+)?\\]\\]`,
      'g'
    );
    const results: { contextBefore: string; contextAfter: string; matchedLink: string }[] = [];
    let match;

    while ((match = linkPattern.exec(body)) !== null) {
      const start = Math.max(0, match.index - 50);
      const end = Math.min(body.length, match.index + match[0].length + 50);
      const contextBefore = body.slice(start, match.index);
      const matchedLink = match[0];
      const contextAfter = body.slice(match.index + matchedLink.length, end);
      results.push({ contextBefore, contextAfter, matchedLink });
    }

    return results;
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  ```

- [ ] **Step 2: 在 SidePanel.tsx 中使用 BacklinksPanel**

  修改 `SidePanel.tsx`，将 `"No backlinks yet"` 占位符替换为：

  ```tsx
  import { BacklinksPanel } from './BacklinksPanel';

  // 在 backlinks tab 中：
  {uiService.activeSidePanelTab === 'backlinks' && <BacklinksPanel />}
  ```

- [ ] **Step 3: 提交**

  ```bash
  git add apps/render/src/components/side-panel/BacklinksPanel.tsx apps/render/src/components/side-panel/SidePanel.tsx
  git commit -m "feat(panel): implement BacklinksPanel with context snippets"
  ```

---

## Chunk 5: apps/render — Graph View（全屏模态）

> 实现知识图谱全屏视图，D3.js Force-directed 布局。

**Files:**
- Create: `apps/render/src/components/graph/GraphView.tsx`
- Create: `apps/render/src/components/graph/GraphCanvas.tsx` (D3 渲染)
- Modify: `apps/render/src/services/graph.service.ts` (添加快捷键监听)

### Task 5.1: 创建 GraphView 模态

- [ ] **Step 1: 创建 GraphView.tsx**

  ```typescript
  // apps/render/src/components/graph/GraphView.tsx

  import { useEffect, useRef, useState } from 'react';
  import { observer } from '@rabjs/react';
  import { useGraphService } from '../../services/graph.service';
  import { EditorService } from '../../services/editor.service';
  import { GraphCanvas } from './GraphCanvas';

  interface GraphViewProps {
    open: boolean;
    onClose: () => void;
  }

  export const GraphView = observer(({ open, onClose }: GraphViewProps) => {
    const graphService = useGraphService();
    const editorService = useService(EditorService);
    const [searchQuery, setSearchQuery] = useState('');

    // 监听 Cmd/Ctrl+G 快捷键
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
          e.preventDefault();
          if (!open) onClose(); // 如果关闭则打开（由父组件控制）
        }
        if (e.key === 'Escape' && open) {
          onClose();
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    if (!open) return null;

    const filteredNodes = searchQuery
      ? graphService.data.nodes.filter(n =>
          n.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.id.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : graphService.data.nodes;

    const filteredEdges = graphService.data.edges.filter(
      e =>
        filteredNodes.some(n => n.id === e.source) &&
        filteredNodes.some(n => n.id === e.target)
    );

    return (
      <div
        className="fixed inset-0 z-50 flex flex-col bg-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Knowledge Graph</h2>
          <input
            type="text"
            placeholder="Filter nodes..."
            className="flex-1 px-3 py-1.5 rounded bg-surface text-sm"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-surface-hover"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 relative">
          <GraphCanvas
            nodes={filteredNodes}
            edges={filteredEdges}
            onNodeClick={(nodeId) => {
              editorService.openNote(nodeId);
              onClose();
            }}
          />
        </div>
      </div>
    );
  });
  ```

- [ ] **Step 2: 创建 GraphCanvas.tsx（D3.js）**

  ```typescript
  // apps/render/src/components/graph/GraphCanvas.tsx

  import { useEffect, useRef } from 'react';
  import * as d3 from 'd3';

  interface GraphNode {
    id: string;
    path: string;
    label?: string;
  }

  interface GraphEdge {
    source: string;
    target: string;
  }

  interface GraphCanvasProps {
    nodes: GraphNode[];
    edges: GraphEdge[];
    onNodeClick: (nodeId: string) => void;
  }

  export const GraphCanvas = ({ nodes, edges, onNodeClick }: GraphCanvasProps) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

      const container = containerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      // 清空旧内容
      d3.select(svgRef.current).selectAll('*').remove();

      const svg = d3.select(svgRef.current)
        .attr('width', width)
        .attr('height', height);

      // Force simulation
      const simulation = d3.forceSimulation(nodes as d3.SimulationNodeDatum[])
        .force('link', d3.forceLink(edges)
          .id((d: d3.SimulationNodeDatum) => (d as GraphNode).id)
          .distance(100)
        )
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide(30));

      // Draw edges
      const link = svg.append('g')
        .selectAll('line')
        .data(edges)
        .join('line')
        .attr('stroke', '#4a4a4a')
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.6);

      // Draw nodes
      const node = svg.append('g')
        .selectAll<SVGGElement, GraphNode>('g')
        .data(nodes)
        .join('g')
        .attr('cursor', 'pointer')
        .call(
          d3.drag<SVGGElement, GraphNode>()
            .on('start', (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on('drag', (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on('end', (event, d) => {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            })
        );

      node.append('circle')
        .attr('r', 8)
        .attr('fill', '#4a9eff');

      node.append('text')
        .text(d => d.label ?? d.id.split('/').pop() ?? d.id)
        .attr('dy', -12)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('fill', '#e0e0e0');

      node.on('click', (_event, d) => {
        onNodeClick(d.id);
      });

      // Tick
      simulation.on('tick', () => {
        link
          .attr('x1', d => (d.source as d3.SimulationNodeDatum).x ?? 0)
          .attr('y1', d => (d.source as d3.SimulationNodeDatum).y ?? 0)
          .attr('x2', d => (d.target as d3.SimulationNodeDatum).x ?? 0)
          .attr('y2', d => (d.target as d3.SimulationNodeDatum).y ?? 0);

        node.attr('transform', d => {
          const nd = d as d3.SimulationNodeDatum;
          return `translate(${nd.x ?? 0}, ${nd.y ?? 0})`;
        });
      });

      return () => {
        simulation.stop();
      };
    }, [nodes, edges, onNodeClick]);

    return (
      <div ref={containerRef} className="w-full h-full">
        <svg ref={svgRef} />
      </div>
    );
  };
  ```

- [ ] **Step 3: 在 app 中集成 GraphView**

  在 `app.tsx` 或对应的页面组件中添加 GraphView 状态和挂载：

  ```tsx
  import { GraphView } from './components/graph/GraphView';

  const [graphViewOpen, setGraphViewOpen] = useState(false);

  // 在 UI 中添加打开按钮（侧边栏图标按钮）：
  <button onClick={() => setGraphViewOpen(true)} title="Open Graph View (⌘G)">
    <NetworkIcon />
  </button>

  // 挂载模态：
  <GraphView open={graphViewOpen} onClose={() => setGraphViewOpen(false)} />
  ```

- [ ] **Step 4: 提交**

  ```bash
  git add apps/render/src/components/graph/
  git commit -m "feat(graph): add GraphView modal with D3 force-directed layout"
  ```

---

## Chunk 6: 集成与联调

> 将各层串联起来，确保数据流端到端工作。

### Task 6.1: 在 VaultService 中集成 graph.buildGraph()

- [ ] **Step 1: 在 VaultService 的 vault 打开成功后调用 buildGraph**

  在 `VaultService` 中找到 `openVault` 或 `initialize` 方法，在 vault 打开成功后：

  ```typescript
  import { GraphService } from './graph.service';

  async openVault(path: string) {
    this.vaultPath = path;
    // ... existing vault open logic ...

    // 构建图谱
    const graphService = this.resolve(GraphService);
    await graphService.buildGraph();
  }
  ```

- [ ] **Step 2: 在编辑器保存时触发增量更新**

  在 `EditorService` 保存笔记后调用：

  ```typescript
  private async saveNote() {
    // ... existing save logic ...
    const graphService = this.resolve(GraphService);
    if (this.currentNote) {
      await graphService.updateNote(this.currentNote.path, this.currentNote.content);
    }
  }
  ```

- [ ] **Step 3: 提交**

  ```bash
  git commit -m "feat(integration): wire VaultService and EditorService to GraphService"
  ```

---

## 实施顺序

1. **Chunk 1** (core Graph) → **必须先完成**，是所有其他层的基础
2. **Chunk 2** (IPC + graph service) → 依赖 Chunk 1
3. **Chunk 3** (Milkdown wiki-link) → 依赖 Chunk 1 + 2
4. **Chunk 4** (Backlinks Panel) → 依赖 Chunk 2
5. **Chunk 5** (Graph View) → 依赖 Chunk 2
6. **Chunk 6** (集成联调) → 依赖 Chunk 1-5 全部完成

---

## 注意事项

- **每个 Task 完成后立即提交**，不要积累大量未提交的改动
- Chunk 1 的测试必须全部 PASS 后才进入 Chunk 2
- Chunk 3 Milkdown 插件是最复杂的部分，如果 Milkdown v7 API 有变化，根据实际情况调整
- d3 已有依赖 (`^7.9.0`)，无需额外安装
- GraphView 和 BacklinksPanel 可以在 Chunk 6 集成阶段连接真实数据
