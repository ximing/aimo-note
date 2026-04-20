# Frontmatter 滚动行为实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将编辑器页面布局改为全页面滚动，使文件名、frontmatter、编辑器内容作为整体滚动。

**Architecture:** 只需调整 `editor/index.tsx` 中滚动容器的位置——把 `overflow-auto` 从 `editor-content` 移到 `editor-page` 上层 div，让 `file-name-header` 和 `frontmatter-panel` 也进入滚动区域。

**Tech Stack:** React 19, Tailwind CSS 3.4

---

## 文件改动

- Modify: `apps/render/src/pages/editor/index.tsx:267-296`

---

## Chunk 1: 滚动容器结构调整

### 1.1 将 `overflow-auto` 从 `editor-content` 移到 `editor-page`

**Files:**
- Modify: `apps/render/src/pages/editor/index.tsx:267-296`

当前代码（第 267-296 行）：

```tsx
<div className="editor-page h-full flex flex-col">
  {/* File Name Input */}
  {service.currentNote && (
    <div className="file-name-header">
      <input ... />
    </div>
  )}
  {service.currentNote && <FrontmatterPanel />}
  <div className="editor-content flex-1 overflow-auto" onContextMenu={handleContextMenu}>
    <MilkdownEditor ... />
  </div>
</div>
```

改为：

```tsx
<div className="editor-page h-full flex flex-col overflow-auto">
  {/* File Name Input */}
  {service.currentNote && (
    <div className="file-name-header">
      <input ... />
    </div>
  )}
  {service.currentNote && <FrontmatterPanel />}
  <div className="editor-content flex-1" onContextMenu={handleContextMenu}>
    <MilkdownEditor ... />
  </div>
</div>
```

**两个关键改动：**
1. `editor-page` div 加 `overflow-auto` — 成为滚动容器
2. `editor-content` div 移除 `overflow-auto` — 不再单独滚动

### 1.2 验证改动

- [ ] 确认 `editor-page` 有 `overflow-auto`
- [ ] 确认 `editor-content` 没有 `overflow-auto`
- [ ] 运行 `pnpm --filter @aimo-note/render dev` 启动渲染进程
- [ ] 打开笔记，滚动确认标题和 frontmatter 一起滚走
- [ ] 滚动到底部时标题完全消失，不再固定在顶部

### 1.3 Commit

- [ ] `git add apps/render/src/pages/editor/index.tsx`
- [ ] `git commit -m "feat(render): make frontmatter scroll with editor content"
