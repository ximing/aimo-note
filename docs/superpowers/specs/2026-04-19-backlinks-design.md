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

### 3.1 接口定义

```typescript
// packages/core/src/graph/index.ts

export interface Graph {
  buildFromNotes(notes: { path: string; body: string }[]): GraphData;
  getBacklinks(path: string): string[]; // 返回链接到 path 的笔记路径列表
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

- `buildFromNotes()` 用已有的 `extractLinks(body)` 遍历所有笔记，构建 `path → Set<targetPath>` 的邻接表
- `getBacklinks(path)` 反向查邻接表
- `getOutlinks(path)` 正向查邻接表
- Vault watcher 在文件变化时增量调用，传入 changed note 触发局部更新

### 3.3 链接解析逻辑

```typescript
// packages/core/src/index.ts 扩展

export function resolveLink(linkText: string, allNotePaths: string[]): string | null {
  // 1. 精确匹配（去掉 .md/.mdx 后缀）
  // 2. 模糊匹配（忽略大小写、扩展名）
  // 3. 返回 null 表示断链
}
```

---

## 四、apps/client — IPC Handler

实现以下 handlers：

| Handler | 说明 |
|---|---|
| `graph:build` | 接收所有笔记 path+body，调用 core.graph.buildFromNotes() |
| `graph:getBacklinks` | 传入 notePath，返回 backlinks 路径数组 |
| `graph:getOutlinks` | 同上，返回 outlinks |
| `graph:getGraphData` | 返回 { nodes, edges } |

---

## 五、apps/render — Wiki-link Node（Milkdown）

### 5.1 新增 Milkdown Plugin

1. **InputRule** — 监听 `[[` 输入，自动补全 `]]`，光标放中间
2. **Node: wikiLink** — schema 定义 `{ attrs: { target: {}, alias: {} } }`
3. **NodeView** — 渲染为 `<span class="wiki-link" data-target="...">`，支持点击跳转
4. **NodeView — embed** — 识别 `![[` 前缀，渲染为嵌入占位块
5. **Slash Command** — `/link` 触发补全列表

### 5.2 插件注册顺序

```
commonmark → GFM → wikiLinkPlugin → linkTooltipPlugin
```

---

## 六、apps/render — Backlinks Panel

- 位置：`apps/render/src/components/side-panel/SidePanel.tsx` 中已有的 Backlinks Tab
- 展示内容：笔记标题 + 所在文件夹路径 + 包含链接的上下文片段（±30 字高亮关键词）
- 点击跳转到对应笔记并高亮
- 数据来源：`graph:getBacklinks(currentNotePath)` + 内容片段搜索

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
Vault watcher 检测变化 → 增量更新 graph
    ↓
Backlinks Panel 自动刷新（监听 currentNote 变化）
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
