# 搜索功能设计方案

## 1. 概述

在侧边栏内实现全文搜索功能，使用 `vscode-ripgrep` 作为搜索引擎，支持搜索词高亮、多种筛选模式。

## 2. 交互设计

### 2.1 侧边栏视图切换

侧边栏 header-row 图标布局：

```
[目录树图标] [搜索图标] | [收起按钮]
```

- **点击目录树图标** (`FolderTree`)：侧边栏切换到 VaultTree 视图
- **点击搜索图标** (`Search`)：侧边栏切换到搜索面板视图
- 收起按钮保持现有行为

### 2.2 搜索流程

1. 用户在搜索输入框输入关键词
2. 300ms 防抖后自动触发搜索
3. 搜索中显示 loading 状态
4. 搜索完成显示结果列表
5. 点击结果项 → 导航到 `/editor/:path`，滚动到匹配行并高亮搜索词

### 2.3 搜索根目录

- 默认使用当前打开的 vault 根目录
- 用户可手动指定其他搜索路径（搜索面板中提供路径输入）

## 3. IPC 架构

### 3.1 职责边界

- **Renderer**：仅负责 UI 渲染、输入处理、结果展示
- **Main Process**：执行 ripgrep 搜索，返回结构化结果
- **边界原则**：renderer 不直接操作文件系统

### 3.2 IPC 调用

```
Renderer                          Main Process
   |                                   |
   |--- ipc:search({                  |
   |      query,                       |
   |      rootPath,                    |
   |      caseSensitive,   ---------> | ripgrep.search()
   |      isRegex                    |       |
   |   })                             |       |
   |                                   |       |
   |<-- results: [{                   |       |
   |      path,                       |       |
   |      line,                       |       |
   |      text,                       |<------|
   |      matchStart,                 |
   |      matchEnd,                   |
   |      lineNumber,                 |
   |   }]                             |
```

### 3.3 目录过滤

默认跳过所有以 `.` 开头的目录（使用 ripgrep 的 `--glob=!.*` 或等效参数）。

## 4. 搜索选项

| 选项       | 类型             | 默认值  | 说明                 |
| ---------- | ---------------- | ------- | -------------------- |
| 搜索模式   | `text` / `regex` | `text`  | 普通文本或正则表达式 |
| 大小写敏感 | boolean          | `false` | 是否区分大小写       |

## 5. 结果数据模型

```typescript
interface SearchMatch {
  path: string; // 文件绝对路径
  line: number; // 行号（1-indexed）
  text: string; // 匹配行的完整文本
  matchStart: number; // 匹配词在行中的起始位置
  matchEnd: number; // 匹配词在行中的结束位置
}

interface SearchResult {
  path: string; // 文件路径（去重后）
  matches: SearchMatch[];
  totalMatches: number; // 该文件中的总匹配数
}
```

## 6. 搜索结果展示

### 6.1 结果列表项

```
note.md:12
  ...这是包含 searchKeyword 的匹配行内容片段...
```

- **文件名 + 行号**：可点击，跳转到编辑器
- **匹配行片段**：搜索词用 `<mark>` 标签包裹高亮
- **折叠策略**：每个文件默认展开前 3 个匹配，更多折叠显示 "Show N more"

### 6.2 状态处理

| 状态   | UI                            |
| ------ | ----------------------------- |
| 空输入 | 显示提示 "输入关键词开始搜索" |
| 搜索中 | 显示 spinner + "搜索中..."    |
| 无结果 | 显示 "未找到匹配结果"         |
| 有结果 | 显示结果列表                  |

## 7. 组件结构

### 7.1 新增文件

```
apps/render/src/components/left-sidebar/
├── SearchPanel.tsx      # 搜索面板主组件
├── SearchInput.tsx      # 搜索输入框 + 选项切换
├── SearchResultList.tsx # 搜索结果列表
└── SearchResultItem.tsx # 单个搜索结果项
    └── index.ts         # 导出

apps/client/src/main/ipc/
└── search.ts            # IPC 处理器，封装 ripgrep 调用

packages/dto/src/
└── search.ts            # 搜索相关类型定义
```

### 7.2 修改文件

- `apps/render/src/components/Layout.tsx` — header-row 添加目录树图标，搜索图标改为切换视图
- `apps/render/src/components/left-sidebar/index.ts` — 导出新增组件
- `apps/render/src/services/search.service.ts` — 完善搜索逻辑，调用 IPC
- `apps/render/src/pages/search/index.tsx` — 简化或重定向到侧边栏搜索

## 8. 目录树图标

使用 `lucide-react` 的 `FolderTree` 图标。

```tsx
import { FolderTree } from 'lucide-react';
```

## 9. 防抖策略

- 搜索输入使用 300ms 防抖
- 防抖期间显示 "输入中..." 而非立即搜索
- 取消未完成的搜索请求（如果用户继续输入）

## 10. 高亮实现

搜索词高亮使用 `<mark>` 标签：

```tsx
function highlightMatch(text: string, start: number, end: number) {
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}
```

`<mark>` 样式定义在 `components.css`：

```css
mark {
  background-color: var(--search-highlight, #fff3bf);
  border-radius: 2px;
  padding: 0 2px;
}
```

深色主题可能需要调整高亮背景色。

## 11. 编辑器联动

点击搜索结果后：

1. 导航到 `/editor/:path`
2. 编辑器加载完成后，滚动到对应行
3. 在该行高亮搜索词（可能是临时的高亮层）

具体实现可参考现有编辑器滚动逻辑。
