# Domain Logic - Core

## 目录说明

`packages/core` 是纯 Node.js 领域逻辑，不依赖 Electron。

## 当前目录结构

```
src/
├── vault/      # 笔记读写、frontmatter 解析
├── graph/      # Wiki-links 和 #tags 提取，构建连接图
├── search/     # 全文搜索（FlexSearch）
├── plugins/    # 钩子式插件系统
└── utils/      # 工具函数
```

## 核心模块

### Vault

使用 `gray-matter` 解析 Markdown frontmatter：

```typescript
import { vault } from '@aimo-note/core';

const note = await vault.open('/path/to/vault');
const files = note.list(); // → Array<{path, title, tags}>
```

### Graph

从笔记内容提取 `[[wiki-links]]` 和 `#tags`：

```typescript
import { graph } from '@aimo-note/core';

const nodes = graph.extractNodes(content);
const links = graph.extractLinks(content);
```

### Search

基于 FlexSearch 的全文搜索：

```typescript
import { search } from '@aimo-note/core';

await search.index(files);
const results = search.query('keyword');
```

## 约束

- **纯 Node.js**：不依赖 Electron、React 或任何浏览器 API
- **单职责**：每个子模块只专注一个领域
- **无副作用**：核心模块应该是可测试的纯函数
- **IPC 无关**：core 不知道谁在调用它（可以是 CLI、主进程、测试）

## 测试

Core 模块应该可以通过直接 import 进行单元测试。
