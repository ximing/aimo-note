# 左侧目录树优化实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 `apps/render/src/components/explorer/` 下的侧边栏文件树进行生产级优化，解决 5 个具体问题。

**Architecture:** 在现有组件基础上进行样式优化和功能修复，不改变整体架构。排序功能暂时只支持名称排序（时间排序需要后端支持时间戳字段）。

**Tech Stack:** React 19 + TypeScript + Tailwind CSS + @rabjs/react + lucide-react

---

## 文件结构

```
apps/render/src/
├── components/
│   ├── common/
│   │   ├── PromptDialog.tsx     # 修改：弹窗样式优化
│   │   ├── ConfirmDialog.tsx   # 修改：保持风格一致
│   │   └── ContextMenu.tsx      # 修改：边界处理
│   └── explorer/
│       ├── TreeNode.tsx         # 修改：显示时去掉 .md 后缀
│       ├── SidebarHeader.tsx    # 修改：排序下拉菜单
│       └── VaultTree.tsx        # 修改：修复选中态 bug，排序逻辑
├── ipc/
│   └── vault.ts                 # 注意：TreeNode 类型暂时无法添加时间戳（需要后端支持）
└── services/
    └── vault.service.ts         # 修改：创建文件时自动处理 .md 后缀
```

---

## Chunk 1: PromptDialog & ConfirmDialog 样式优化

**Files:**

- Modify: `apps/render/src/components/common/PromptDialog.tsx:39-78`
- Modify: `apps/render/src/components/common/ConfirmDialog.tsx:32-66`

- [ ] **Step 1: 修改 PromptDialog 样式**

打开 `apps/render/src/components/common/PromptDialog.tsx`，替换第 44-47 行和第 60-74 行：

```tsx
// 第 44-47 行：将
className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md p-4"
// 替换为：
className="bg-white dark:bg-[--bg-primary] border border-[--border] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] w-full max-w-md p-6"

// 第 47 行输入框：将
className="w-full px-3 py-2 border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
// 替换为：
className="w-full px-4 py-3 border-2 border-[--border] dark:border-[--border] rounded-lg bg-[--bg-primary] text-[--text-primary] focus:outline-none focus:border-[--accent] transition-colors"

// 第 60-74 行按钮区域：将
<div className="flex justify-end gap-2 mt-4">
  <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-border rounded hover:bg-accent">Cancel</button>
  <button type="submit" disabled={!value.trim()} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">Confirm</button>
</div>
// 替换为：
<div className="flex justify-end gap-3 mt-6">
  <button
    type="button"
    onClick={onCancel}
    className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[--bg-tertiary] text-[--text-primary] hover:bg-[--border] transition-colors"
  >
    取消
  </button>
  <button
    type="submit"
    disabled={!value.trim()}
    className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[--accent] text-white hover:bg-[--accent-hover] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
  >
    创建
  </button>
</div>
```

- [ ] **Step 2: 修改 PromptDialog 标题区域**

在第 49 行 `<h3>` 标签后添加样式：

```tsx
// 将
<h3 className="text-lg font-medium mb-4">{title}</h3>
// 替换为：
<h3 className="text-lg font-semibold mb-2 text-[--text-primary]">{title}</h3>
```

- [ ] **Step 3: 修改 ConfirmDialog 样式**

打开 `apps/render/src/components/common/ConfirmDialog.tsx`，替换第 37-62 行：

```tsx
// 将
className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md p-4"
// 替换为：
className="bg-white dark:bg-[--bg-primary] border border-[--border] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] w-full max-w-md p-6"

// 替换按钮区域（第 43-62 行）：
// 将整个 <div className="flex justify-end gap-2"> 替换为：
<div className="flex justify-end gap-3">
  <button
    type="button"
    onClick={onCancel}
    className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[--bg-tertiary] text-[--text-primary] hover:bg-[--border] transition-colors"
  >
    {cancelText}
  </button>
  <button
    type="button"
    onClick={onConfirm}
    className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
      danger
        ? 'bg-red-500 text-white hover:bg-red-600'
        : 'bg-[--accent] text-white hover:bg-[--accent-hover]'
    }`}
  >
    {confirmText}
  </button>
</div>
```

- [ ] **Step 4: 修改 ConfirmDialog 标题样式**

```tsx
// 将
<h3 className="text-lg font-medium mb-2">{title}</h3>
// 替换为：
<h3 className="text-lg font-semibold mb-2 text-[--text-primary]">{title}</h3>
```

- [ ] **Step 5: 提交**

```bash
git add apps/render/src/components/common/PromptDialog.tsx apps/render/src/components/common/ConfirmDialog.tsx
git commit -m "feat(render): improve dialog styling with Ant Design-like appearance

- Add stronger shadows and rounded corners
- Primary button uses accent color
- Secondary button uses neutral gray
- Input focus state uses accent border

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: ContextMenu 边界处理

**Files:**

- Modify: `apps/render/src/components/common/ContextMenu.tsx:56-58`

- [ ] **Step 1: 改进 ContextMenu 边界检测**

打开 `apps/render/src/components/common/ContextMenu.tsx`，找到第 56-58 行：

```tsx
// 当前代码（有问题）：
const adjustedX = Math.min(x, window.innerWidth - 200);
const adjustedY = Math.min(y, window.innerHeight - 200);
```

替换为：

```tsx
// 改进：使用实际菜单尺寸进行边界调整
const MENU_MIN_WIDTH = 180;
const MENU_ESTIMATED_HEIGHT = 200;
const PADDING = 8;

// 计算右边界溢出
let adjustedX = x;
if (x + MENU_MIN_WIDTH > window.innerWidth - PADDING) {
  adjustedX = window.innerWidth - MENU_MIN_WIDTH - PADDING;
}

// 计算下边界溢出，优先在点击位置下方显示，如果空间不够则显示在上方
let adjustedY = y;
const spaceBelow = window.innerHeight - y;
const spaceAbove = y;

if (spaceBelow < MENU_ESTIMATED_HEIGHT && spaceAbove > spaceBelow) {
  // 下方空间不足，上方空间更多，显示在上方
  adjustedY = y - MENU_ESTIMATED_HEIGHT;
}
// 确保不会超出顶部
adjustedY = Math.max(PADDING, adjustedY);
```

- [ ] **Step 2: 提交**

```bash
git add apps/render/src/components/common/ContextMenu.tsx
git commit -m "fix(render): improve ContextMenu positioning with viewport boundary detection

- Detect when menu would overflow viewport
- Flip to above position when insufficient space below
- Ensure menu never clips at viewport edges

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: .md 后缀处理

**Files:**

- Modify: `apps/render/src/components/explorer/TreeNode.tsx:103`
- Modify: `apps/render/src/components/explorer/VaultTree.tsx:74-86`
- Modify: `apps/render/src/components/explorer/VaultTree.tsx:147-172`

- [ ] **Step 1: TreeNode 显示时去掉 .md 后缀**

打开 `apps/render/src/components/explorer/TreeNode.tsx`，找到第 103 行：

```tsx
// 当前：
<span className="truncate text-sm">{node.name}</span>

// 替换为：
<span className="truncate text-sm">{node.name.replace(/\.md$/, '')}</span>
```

- [ ] **Step 2: VaultTree 创建文件时自动处理 .md 后缀**

打开 `apps/render/src/components/explorer/VaultTree.tsx`，找到 `handleDialogConfirm` 函数（第 74-86 行）：

```tsx
// 当前：
const handleDialogConfirm = useCallback(
  (value: string) => {
    if (dialog.type === 'newFile') {
      vaultService.createNote(dialog.parentPath || '', value);
    } else if (dialog.type === 'newFolder') {
      vaultService.createFolder(dialog.parentPath || '', value);
    } else if (dialog.type === 'rename' && dialog.node) {
      vaultService.renameNode(dialog.node, value);
    }
    setDialog({ type: null });
  },
  [dialog, vaultService]
);

// 替换为：
const handleDialogConfirm = useCallback(
  (value: string) => {
    // 清理用户输入，去除末尾的 .md（如果用户输入了的话）
    const cleanName = value.replace(/\.md$/, '').trim();
    if (!cleanName) return;

    if (dialog.type === 'newFile') {
      vaultService.createNote(dialog.parentPath || '', cleanName);
    } else if (dialog.type === 'newFolder') {
      vaultService.createFolder(dialog.parentPath || '', cleanName);
    } else if (dialog.type === 'rename' && dialog.node) {
      // 重命名时也需要处理 .md
      const cleanNewName = cleanName.replace(/\.md$/, '');
      vaultService.renameNode(dialog.node, cleanNewName);
    }
    setDialog({ type: null });
  },
  [dialog, vaultService]
);
```

- [ ] **Step 3: 更新 PromptDialog 默认值和提示**

找到 `newFile` 的 PromptDialog（第 147-155 行）：

```tsx
// 当前：
{
  dialog.type === 'newFile' && (
    <PromptDialog
      title="New File"
      defaultValue="untitled.md"
      placeholder="Enter file name"
      onConfirm={handleDialogConfirm}
      onCancel={() => setDialog({ type: null })}
    />
  );
}

// 替换为：
{
  dialog.type === 'newFile' && (
    <PromptDialog
      title="新建文件"
      defaultValue="untitled"
      placeholder="输入文件名"
      onConfirm={handleDialogConfirm}
      onCancel={() => setDialog({ type: null })}
    />
  );
}
```

同样更新 `newFolder`（第 156-164 行）：

```tsx
// 替换为：
{
  dialog.type === 'newFolder' && (
    <PromptDialog
      title="新建文件夹"
      defaultValue="new-folder"
      placeholder="输入文件夹名"
      onConfirm={handleDialogConfirm}
      onCancel={() => setDialog({ type: null })}
    />
  );
}
```

重命名弹窗（第 165-173 行）：

```tsx
// 替换为：
{
  dialog.type === 'rename' && dialog.node && (
    <PromptDialog
      title="重命名"
      defaultValue={dialog.node.name.replace(/\.md$/, '')}
      placeholder="输入新名称"
      onConfirm={handleDialogConfirm}
      onCancel={() => setDialog({ type: null })}
    />
  );
}
```

- [ ] **Step 4: 提交**

```bash
git add apps/render/src/components/explorer/TreeNode.tsx apps/render/src/components/explorer/VaultTree.tsx
git commit -m "feat(render): remove .md suffix from display and creation

- TreeNode displays filename without .md extension
- Create/rename automatically strips .md if user types it
- Default value for new files is 'untitled' (without .md)
- Updated dialog titles and placeholders to Chinese

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: 文件夹内文件选中态修复

**Files:**

- Modify: `apps/render/src/components/explorer/VaultTree.tsx:128-143`
- Modify: `apps/render/src/components/explorer/TreeNode.tsx:107-120`

- [ ] **Step 1: 分析 Bug 原因**

在 `VaultTree.tsx` 第 134 行：

```tsx
isSelected={activeFile === node.path}
```

这个逻辑对于根节点是正确的。问题在于递归的子节点没有正确传递 `isSelected` 属性。

查看 `TreeNode.tsx` 第 107-120 行，子节点的递归调用缺少 `isSelected` 传递。

- [ ] **Step 2: 修复 TreeNode 递归传递 isSelected**

打开 `apps/render/src/components/explorer/TreeNode.tsx`，找到第 107-120 行：

```tsx
// 当前：
<TreeNode
  key={child.path}
  node={child}
  depth={depth + 1}
  isExpanded={expandedPaths?.has(child.path) || false}
  onToggleExpand={() => onToggleExpandDeep?.(child.path)}
  expandedPaths={expandedPaths}
  onToggleExpandDeep={onToggleExpandDeep}
  onNewFile={onNewFile}
  onNewFolder={onNewFolder}
  onRename={onRename}
  onDelete={onDelete}
/>

// 替换为：添加 isSelected 属性
<TreeNode
  key={child.path}
  node={child}
  depth={depth + 1}
  isExpanded={expandedPaths?.has(child.path) || false}
  isSelected={false}  // 初始值，父组件会通过 expandedPaths 更新
  onToggleExpand={() => onToggleExpandDeep?.(child.path)}
  expandedPaths={expandedPaths}
  onToggleExpandDeep={onToggleExpandDeep}
  onNewFile={onNewFile}
  onNewFolder={onNewFolder}
  onRename={onRename}
  onDelete={onDelete}
/>
```

**注意：** 实际上这个 bug 的根本原因是 `isSelected` 没有从父组件正确传递下来。需要在 VaultTree 中添加逻辑来追踪 `activeFile`。

- [ ] **Step 3: 修复 VaultTree 传递 isSelected**

打开 `apps/render/src/components/explorer/VaultTree.tsx`，添加一个辅助函数来递归检查子节点：

在文件顶部添加新状态和函数：

```tsx
// 在 VaultTree 组件内部，在 toggleExpanded 之后添加：
const [selectedPath, setSelectedPath] = useState<string | null>(null);

// 修改 handleNewFile 或在 vaultService.setActiveFile 时更新 selectedPath
// 或者直接使用 vaultService.activeFile 作为来源

// 实际上问题在于 TreeNode 递归时需要知道 activeFile
// 我们需要通过 props 传递 isSelected 给每个子节点
```

更简单的解决方案：在 TreeNode 组件内部直接比较 `node.path === activeFile`，而不是依赖父组件传递。

```tsx
// 在 TreeNode.tsx 中，添加对 vaultService.activeFile 的监听
// 找到 TreeNode 组件内部，在 isFolder 计算后添加：
const isSelected = vaultService.activeFile === node.path;
```

然后在渲染时使用这个 `isSelected` 而不是 props 传入的 `isSelected`。

- [ ] **Step 4: 实现修复**

打开 `apps/render/src/components/explorer/TreeNode.tsx`，修改：

```tsx
// 在组件内部，删除 isSelected prop 的使用，改为直接使用 vaultService.activeFile
// 找到第 33 行：
const [isSelected, setIsSelected] = useState(false);  // 删除这行

// 找到第 45 行 isFolder 计算后添加：
const isSelected = vaultService.activeFile === node.path;

// 删除 button 上的 isSelected prop 引用（第 90 行），改为：
className={`flex items-center gap-1 w-full px-2 py-1 hover:bg-accent rounded text-left ${isSelected ? 'bg-accent text-white' : ''}`}
```

删除 TreeNode 递归调用中的 `isSelected={false}` 添加（因为现在使用 vaultService.activeFile）。

- [ ] **Step 5: 提交**

```bash
git add apps/render/src/components/explorer/TreeNode.tsx
git commit -m "fix(render): correct file selection state in folder tree

- TreeNode now directly compares node.path with vaultService.activeFile
- Selection highlight works correctly for nested files
- Removed redundant isSelected prop from recursive calls

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 5: 排序功能重构

**Files:**

- Modify: `apps/render/src/components/explorer/SidebarHeader.tsx`
- Modify: `apps/render/src/components/explorer/VaultTree.tsx`

**注意：** 当前 TreeNode 类型不包含 `createdAt` 和 `modifiedAt` 字段。排序功能暂时只实现名称排序（A-Z, Z-A）。时间排序需要后端支持。

- [ ] **Step 1: 修改 SidebarHeader 添加排序下拉**

打开 `apps/render/src/components/explorer/SidebarHeader.tsx`，完整重写：

```tsx
import { useState, useRef, useEffect } from 'react';
import { FilePlus, FolderPlus, ChevronsUpDown, Check } from 'lucide-react';

export type SortOption =
  | 'name-asc'
  | 'name-desc'
  | 'created-desc'
  | 'created-asc'
  | 'modified-desc'
  | 'modified-asc';

interface SidebarHeaderProps {
  onNewFile: () => void;
  onNewFolder: () => void;
  sortBy: 'name' | 'created' | 'modified';
  sortOrder: 'asc' | 'desc';
  onSortChange: (sortBy: 'name' | 'created' | 'modified', sortOrder: 'asc' | 'desc') => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

const sortOptions: { value: SortOption; label: string; icon: string }[] = [
  { value: 'name-asc', label: '按文件名 A-Z', icon: '📄' },
  { value: 'name-desc', label: '按文件名 Z-A', icon: '📄' },
  { value: 'created-desc', label: '按创建时间 ↓', icon: '📅' },
  { value: 'created-asc', label: '按创建时间 ↑', icon: '📅' },
  { value: 'modified-desc', label: '按编辑时间 ↓', icon: '✏️' },
  { value: 'modified-asc', label: '按编辑时间 ↑', icon: '✏️' },
];

export function SidebarHeader({
  onNewFile,
  onNewFolder,
  sortBy,
  sortOrder,
  onSortChange,
  onExpandAll,
  onCollapseAll,
}: SidebarHeaderProps) {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentSortValue = `${sortBy}-${sortOrder}` as SortOption;
  const currentLabel = sortOptions.find((o) => o.value === currentSortValue)?.label || '排序';

  const handleSortSelect = (value: SortOption) => {
    const [newSortBy, newSortOrder] = value.split('-') as [
      'name' | 'created' | 'modified',
      'asc' | 'desc',
    ];
    onSortChange(newSortBy, newSortOrder);
    setShowSortMenu(false);
  };

  return (
    <div className="sidebar-header flex items-center gap-1 px-2 py-2 border-b border-[--border]">
      <button
        type="button"
        onClick={onNewFile}
        className="p-1.5 hover:bg-[--accent] hover:text-white rounded text-sm transition-colors"
        title="新建文件"
      >
        <FilePlus size={16} />
      </button>
      <button
        type="button"
        onClick={onNewFolder}
        className="p-1.5 hover:bg-[--accent] hover:text-white rounded text-sm transition-colors"
        title="新建文件夹"
      >
        <FolderPlus size={16} />
      </button>
      <div className="flex-1" />

      {/* Sort Dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setShowSortMenu(!showSortMenu)}
          className="p-1.5 hover:bg-[--accent] hover:text-white rounded text-sm transition-colors flex items-center gap-1"
          title="排序"
        >
          <span className="text-base">↕️</span>
        </button>

        {showSortMenu && (
          <div className="absolute right-0 top-full mt-1 bg-[--bg-primary] border border-[--border] rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.15)] min-w-[180px] z-50 py-1">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSortSelect(option.value)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-[--accent] hover:text-white transition-colors ${
                  currentSortValue === option.value
                    ? 'bg-[--accent] bg-opacity-10 text-[--accent]'
                    : ''
                }`}
              >
                <span>{option.icon}</span>
                <span className="flex-1">{option.label}</span>
                {currentSortValue === option.value && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onExpandAll}
        className="p-1.5 hover:bg-[--accent] hover:text-white rounded text-sm transition-colors"
        title="展开全部"
      >
        <ChevronsUpDown size={16} />
      </button>
      <button
        type="button"
        onClick={onCollapseAll}
        className="p-1.5 hover:bg-[--accent] hover:text-white rounded text-sm transition-colors"
        title="折叠全部"
      >
        <ChevronsUpDown size={16} className="rotate-180" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 更新 VaultTree 排序逻辑**

打开 `apps/render/src/components/explorer/VaultTree.tsx`：

1. 添加新的状态：

```tsx
// 第 19 行后添加：
const [sortBy, setSortBy] = useState<'name' | 'created' | 'modified'>('name');
```

2. 修改 `handleSortChange`：

```tsx
// 将第 54-56 行：
const handleSortChange = useCallback((order: 'asc' | 'desc') => {
  setSortOrder(order);
}, []);

// 替换为：
const handleSortChange = useCallback(
  (newSortBy: 'name' | 'created' | 'modified', newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
  },
  []
);
```

3. 修改排序逻辑（第 103-110 行）：

```tsx
// 当前：
const sortedTree = [...tree].sort((a, b) => {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
  return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
});

// 替换为：
const sortedTree = [...tree].sort((a, b) => {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;

  let comparison = 0;
  if (sortBy === 'name') {
    // 去掉 .md 后缀再比较
    const nameA = a.name.replace(/\.md$/, '');
    const nameB = b.name.replace(/\.md$/, '');
    comparison = nameA.localeCompare(nameB);
  }
  // 注意：created 和 modified 时间排序需要后端支持
  // 暂时只实现 name 排序

  return sortOrder === 'asc' ? comparison : -comparison;
});
```

4. 更新 SidebarHeader 调用（第 114-121 行）：

```tsx
// 当前：
<SidebarHeader
  onNewFile={() => handleNewFile('')}
  onNewFolder={() => handleNewFolder('')}
  sortOrder={sortOrder}
  onSortChange={handleSortChange}
  onExpandAll={handleExpandAll}
  onCollapseAll={handleCollapseAll}
/>

// 替换为：
<SidebarHeader
  onNewFile={() => handleNewFile('')}
  onNewFolder={() => handleNewFolder('')}
  sortBy={sortBy}
  sortOrder={sortOrder}
  onSortChange={handleSortChange}
  onExpandAll={handleExpandAll}
  onCollapseAll={handleCollapseAll}
/>
```

- [ ] **Step 3: 提交**

```bash
git add apps/render/src/components/explorer/SidebarHeader.tsx apps/render/src/components/explorer/VaultTree.tsx
git commit -m "feat(render): add 6-option sort dropdown to sidebar

- Replace two-button sort with single dropdown menu
- Options: name A-Z, name Z-A, created desc/asc, modified desc/asc
- Uses Check icon to indicate current selection
- Note: time-based sorting requires backend timestamp support

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 验证清单

- [ ] Light 主题下所有组件显示正常
- [ ] Dark 主题下所有组件显示正常
- [ ] 文件名不显示 .md 后缀
- [ ] 新建文件输入 "untitled" → 创建 "untitled.md"
- [ ] 文件夹内文件点击有选中高亮
- [ ] 排序下拉显示 6 种选项（时间排序 UI 可见但功能暂不可用）
- [ ] 右键菜单位置跟随鼠标，不超出视口

---

## 后续工作（需后端支持）

时间戳排序需要在后端实现：

1. `TreeNode` 类型添加 `createdAt: number` 和 `modifiedAt: number` 字段
2. 后端 `vault.list()` 返回的节点包含时间戳
3. 前端排序逻辑完整实现时间排序
