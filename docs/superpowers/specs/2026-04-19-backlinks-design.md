# Obsidian 双链功能设计规格

## 概述

实现 Obsidian 风格的完整双向链接系统，包括：Wiki-link 编辑渲染、嵌入（Transclusion）延迟渲染、Backlinks 面板、知识图谱、别名语法和断链提示。

---

## 一、能力范围

| 功能 | 说明 |
|---|---|
| Wiki-link 编辑渲染 | `[[笔记]]` 在 Milkdown 编辑器中渲染为可点击内联元素 |
| 别名语法 | `[[笔记\|显示文本]]`，解析时精确优先 + 模糊兜底 |
| 嵌入（Transclusion） | `![[笔记]]` 延迟渲染，默认占位符，hover/click 展开 |
| Backlinks 面板 | 侧边栏显示当前笔记的所有反向链接（笔记名 + 上下文片段） |
| 知识图谱 | 全屏模态图谱视图，节点可拖拽，点击跳转 |
| 断链提示 | 链接目标不存在时显示红色/虚线下划线标识 |
| 块引用 | **不在本版本范围内** |

---

## 二、分层架构

```
packages/core        # 纯 Node.js domain
  ├── graph/        # 图数据构建、backlinks/outlinks 查询
  ├── vault/        # 笔记读写 + watcher（已有）
  └── index.ts      # extractLinks() + resolveLink() 复用

apps/client         # Electron main process
  └── ipc/handlers  # graph:build / getBacklinks / getOutlinks / getGraphData

apps/render         # React renderer
  ├── components/
  │   ├── editor/         # Milkdown 自定义 wikiLink Node + NodeView
  │   ├── side-panel/     # BacklinksPanel 组件
  │   └── graph/          # GraphView 全屏模态
  ├── services/
  │   ├── editor.service  # 已有，扩展 link 操作
  │   └── graph.service   # 新增，封装 graph IPC
  └── ipc/
      └── graph.ts        # 已有占位，填充实际 IPC 调用
```

---

## 三、packages/core — Graph 模块

> ⚠️ 注意：`packages/core/src/graph/index.ts` 目前仅有接口定义（无实现）。本模块需新建 `packages/core/src/graph/graph.ts` 实现文件。

### 3.1 接口定义（已有，复述确认）

```typescript
// packages/core/src/graph/index.ts

export interface Graph {
  buildFromNotes(notes: { path: string; body: string }[]): GraphData;
  getGraphData(): GraphData;             // 返回完整图数据（供 IPC 调用）
  getBacklinks(path: string): string[];  // 返回链接到 path 的笔记路径列表
  getOutlinks(path: string): string[];   // 返回 path 中所有外链目标路径列表
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  path: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}
```

### 3.2 实现策略

- `buildFromNotes()` 遍历所有笔记，通过 `extractLinks(body)` 提取链接，构建 `path → Set<targetPath>` 邻接表
- `getBacklinks(path)` 反向查邻接表
- `getOutlinks(path)` 正向查邻接表
- Vault watcher 在文件变化时**按需增量**：传入 changed note，移除旧边、添加新边

### 3.3 链接解析算法

#### 3.3.1 Wiki-link 正则（需更新 `packages/core/src/index.ts`）

原正则 `/\[\[([^\]]+)\]\]/g` 会把 `[[笔记|别名]]` 整体作为一个字符串捕获。需要拆分 alias：

```typescript
const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g;
// 捕获组1: target（链接目标，不含 | 和 ] 的部分）
// 捕获组2: alias（可选，不含 | 的别名部分，防止 `[[A|B|c]]` 误匹配）

// 对于 ![[嵌入笔记]] 嵌入语法：
const EMBED_REGEX = /!\[\[([^\]|]+)(?:\|([^\]|]+))?\]\]/g;
```

> ⚠️ 块引用 `[[笔记#block-id]]` 暂不支持，正则中的 `[^\]|]` 排除 `#` 字符，确保本版本不会误匹配。

#### 3.3.2 resolveLink 算法

```typescript
// packages/core/src/index.ts

export function resolveLink(
  linkText: string,      // wiki-link 中的 target 部分（不含 [[]] 和 alias）
  allNotePaths: string[]  // vault 中所有笔记的相对路径（不含 .md/.mdx 后缀）
): string | null {
  // 标准化：去掉扩展名，统一路径分隔符
  const candidates = allNotePaths.map(p =>
    p.replace(/\.mdx?$/, '').replace(/\\/g, '/')
  );
  // 标准化 linkText
  const normalized = linkText.replace(/\\/g, '/');

  // Step 1: 精确匹配
  const exact = candidates.find(c => c === normalized);
  if (exact) return exact;

  // Step 2: 模糊匹配（忽略大小写）
  const lc = normalized.toLowerCase();
  const fuzzy = candidates.find(c => c.toLowerCase() === lc);
  if (fuzzy) return fuzzy;

  // Step 3: 部分匹配（最后一个路径段匹配，如 [[笔记]] 匹配 "子目录/笔记"）
  const partial = candidates.filter(c => {
    const lcFull = c.toLowerCase();
    const lastSegment = lcFull.split('/').pop();
    return lastSegment === lc || lcFull.includes(lc);
  });
  return partial[0] ?? null; // null = 断链
}
```

> ⚠️ `[[子目录/笔记]]` 路径直接走精确匹配（支持嵌套路径）。

### 3.4 边缘情况处理

| 场景 | 处理方式 |
|---|---|
| 自链 `[[当前笔记]]` | **不**计入 backlinks 和 outlinks（避免自我引用污染面板） |
| 循环引用 A↔B | 正常计入各自 outlinks/backlinks，图谱中显示双向边 |
| 笔记重命名 | **暂不处理**（rename propagation 属于高级特性，后续单独 spec） |
| 多模糊匹配 | 返回第一个（模糊匹配列表无序，结果不稳定，接受现状） |

---

## 四、apps/client — IPC Handler

实现以下 handlers（统一使用 `noteId` 参数名，对应笔记相对路径）：

| Handler | 说明 |
|---|---|
| `graph:build` | 接收所有笔记 `{ path, body }[]`，调用 core.graph.buildFromNotes()，返回空 `{}` |
| `graph:getBacklinks` | 传入 noteId，返回 backlinks 路径数组 `string[]` |
| `graph:getOutlinks` | 传入 noteId，返回 outlinks 路径数组 `string[]` |
| `graph:getGraph` | 返回完整图数据 `{ nodes: GraphNode[], edges: GraphEdge[] }` |

---

## 五、apps/render — Wiki-link Node（Milkdown）

### 5.1 新增 Milkdown Plugin

1. **InputRule** — 监听 `[[` 输入，自动补全 `]]`，光标放中间
2. **Node: wikiLink** — schema 定义 `{ attrs: { target: {}, alias: {}, isEmbed: false } }`
3. **NodeView** — 渲染为 `<span class="wiki-link" data-target="...">`，支持点击跳转
4. **NodeView — embed** — 识别 `![[` 前缀，渲染为嵌入占位块（详见 5.3）
5. **Slash Command** — `/link` 触发补全列表

### 5.2 Wiki-link 点击行为

| 场景 | 行为 |
|---|---|
| `[[笔记]]` + 目标存在 | 跳转（打开目标笔记） |
| `[[笔记]]` + 目标**不存在** | 标记断链（红色虚线样式），点击提示"创建笔记？" |
| `![[笔记]]` | 触发嵌入展开（hover/click，详见 5.3） |

### 5.3 嵌入（Transclusion）渲染

嵌入节点渲染为占位块，结构和交互：

```tsx
// 嵌入占位符结构
<div class="embed-block" data-target="笔记名">
  <div class="embed-header">
    <span class="embed-title">笔记名</span>
    <button class="embed-collapse">▼</button>
  </div>
  {expanded ? (
    // 展开状态：渲染嵌入内容
    <div class="embed-content">{renderedContent}</div>
  ) : (
    // 收起状态：显示预览摘要
    <div class="embed-placeholder">点击展开 / hover 展开嵌入内容</div>
  )}
</div>
```

**触发展开方式**：鼠标 hover（300ms debounce）或点击占位区域。键盘支持 Enter/Space 展开。

> ⚠️ 嵌入内容**仅读取**（不编辑），编辑需跳转原笔记。刷新策略：嵌入笔记变化后，下次展开时重新拉取（不主动推送刷新，避免复杂度）。

### 5.4 插件注册顺序

在 `MilkdownEditorInner.tsx` 现有插件列表基础上**追加** wikiLinkPlugin：

```
commonmark → gfm → history → listener → slash → math
  → imageBlockComponent → imageInlineComponent
  → wikiLinkPlugin  ← 新增
  → linkTooltipPlugin → block
```

---

## 六、apps/render — Backlinks Panel

- 位置：`apps/render/src/components/side-panel/SidePanel.tsx` 中已有的 Backlinks Tab（当前为占位输出，需替换）
- 展示内容：笔记标题 + 所在文件夹路径 + 包含链接的上下文片段
- 点击跳转到对应笔记并高亮
- 数据来源：`graph:getBacklinks(currentNotePath)` + 内容片段搜索

### 6.1 上下文片段提取算法

1. 在源笔记中定位 `[[当前笔记]]` 出现位置（使用 `extractLinks` 结果）
2. 取该位置前后各 **50 个字符**（字符级，非字节级，不切割多字节字符如中文）
3. 高亮方式：将 `[[当前笔记]]` 文字本身用 `<mark>` 包裹
4. 若同一笔记多次链接到当前笔记，每条单独展示一行

### 6.2 Vault Watcher 触发条件

> ⚠️ Vault watcher 在 `packages/core/src/vault/index.ts` 中仅为接口（无实现）。增量图更新依赖 watcher 实现后生效。

触发时序：

| 事件 | 图更新行为 |
|---|---|
| **笔记保存** | 传入 `{ path, body }`，移除旧外链边，添加新边 |
| **笔记删除** | 传入 path，移除所有相关边（入边 + 出边） |
| **笔记移动/重命名** | 传入 `{ oldPath, newPath }`，更新所有指向 oldPath 的边 |
| **首次打开 vault** | 调用 `graph:build` 全量构建 |

---

## 七、apps/render — Graph View（全屏模态）

- 组件：`apps/render/src/components/graph/GraphView.tsx`
- 交互：快捷键 `Cmd/Ctrl+G` 或点击侧边栏图标打开
- D3.js / Force-directed layout
- 节点可拖拽，点击跳转
- 搜索框过滤节点
- 关闭按钮 + ESC 键

---

## 八、数据流

```
用户编辑笔记
    ↓
Milkdown onChange → debounce 300ms
    ↓
editor.service → IPC: note:save
    ↓
Vault watcher 检测变化 → 增量更新 graph（增/删/改边）
    ↓
Backlinks Panel 监听 currentNote 变化 → 重新拉取 backlinks
Graph View 监听 graph 更新 → 重渲染图谱
    ↓
点击 wiki-link → 跳转 / 打开嵌入 / 标记断链
```

---

## 九、技术决策总结

| 决策点 | 选择 |
|---|---|
| Graph 更新策略 | 按需构建 + 增量（Vault watcher 触发） |
| Wiki-link 渲染方式 | Milkdown 自定义 Node + InputRule + NodeView |
| 链接解析 | 精确匹配优先 → 模糊匹配兜底 |
| 嵌入渲染 | 延迟渲染（默认占位符，hover/click 展开） |
| 图谱交互 | 全屏模态 |
| 块引用 | 不在范围内 |
