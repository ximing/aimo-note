# Frontmatter 滚动行为设计

## 1. 概述

将编辑器页面布局改为全页面滚动，使文件名输入框、frontmatter 面板和编辑器内容作为一个整体滚动到底部时，标题会完全滚出视野。

## 2. 目标

- 文件名、frontmatter、编辑器内容共同作为一个滚动整体
- 滚动到底部时标题完全消失，不再固定在顶部

## 3. 当前布局

```
editor-page (flex-col)
  ├── file-name-header   ← 固定在顶部，不随编辑器滚动
  ├── frontmatter-panel  ← 固定在顶部，不随编辑器滚动
  └── editor-content    ← flex-1 overflow-auto（滚动容器仅到这里）
       └── MilkdownEditor
```

`file-name-header` 和 `frontmatter-panel` 位于滚动容器之外，始终固定。

## 4. 改动后布局

```
editor-page (flex-col)
  └── scroll-container (overflow-auto) ← 滚动容器扩大到整个页面内容
       ├── file-name-header
       ├── frontmatter-panel
       └── editor-content (flex-1, 无 overflow)
            └── MilkdownEditor
```

## 5. 改动范围

| 文件 | 改动 |
|------|------|
| `apps/render/src/pages/editor/index.tsx` | 将 `file-name-header` 和 `FrontmatterPanel` 移入滚动容器 div |
| `apps/render/src/styles/layout.css` | `.editor-page` 不需要改动，只需确认滚动行为正确 |

## 6. 实现方式

在 `editor/index.tsx` 中：

当前：
```tsx
<div className="editor-page h-full flex flex-col">
  {service.currentNote && (
    <div className="file-name-header">...</div>
  )}
  {service.currentNote && <FrontmatterPanel />}
  <div className="editor-content flex-1 overflow-auto" onContextMenu={handleContextMenu}>
    <MilkdownEditor ... />
  </div>
</div>
```

改动后：
```tsx
<div className="editor-page h-full flex flex-col overflow-auto">
  {service.currentNote && (
    <div className="file-name-header">...</div>
  )}
  {service.currentNote && <FrontmatterPanel />}
  <div className="editor-content flex-1" onContextMenu={handleContextMenu}>
    <MilkdownEditor ... />
  </div>
</div>
```

关键改动：
- `editor-page` div 本身变为滚动容器（加 `overflow-auto`）
- `editor-content` 移除 `overflow-auto`，保持 `flex-1` 填满剩余空间

## 7. CSS 继承说明

`editor-page` 已有 `h-full flex flex-col`，只需加上 `overflow-auto`。不需要新增 CSS 类。

## 8. 边界情况

- 新建空笔记（无 frontmatter）：`file-name-header` 正常随页面滚动
- frontmatter 面板为空状态（只显示"+ 添加 Frontmatter"按钮）：行为不变
- 长笔记滚动到底部：标题、frontmatter 均完全滚出视野
