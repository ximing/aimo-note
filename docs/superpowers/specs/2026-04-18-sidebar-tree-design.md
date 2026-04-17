# 左侧目录树优化设计

## 概述

对 `apps/render/src/components/explorer/` 下的侧边栏文件树进行生产级优化，解决 5 个具体问题。

---

## 问题 1：PromptDialog 样式优化

### 现状
- 背景透明，使用 `bg-background`（无主色强调）
- 按钮样式平淡，缺少主次区分

### 目标
参考 Ant Design 弹窗风格：
- 白色背景 + 清晰阴影
- 主按钮使用 accent 色（`#42b883` / `#5fc495`）
- 次按钮使用中性灰
- 输入框有 focus 态（accent 色边框）

### 实现
```tsx
// PromptDialog.tsx
// 对话框容器
className="bg-white dark:bg-[#1a1a2e] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.15)]"

// 输入框 focus
className="border-2 border-[#e5e7eb] dark:border-[#2d2d44] focus:border-accent"

// 主按钮
className="bg-accent hover:bg-accent-hover text-white"

// 次按钮
className="bg-[#f1f3f5] dark:bg-[#0f0f1a] text-text-primary hover:bg-border"
```

---

## 问题 2：ContextMenu 右键菜单位置

### 现状
- 菜单使用 `clientX/clientY` 定位（正确）
- 但没有处理边界溢出，导致菜单被截断

### 目标
- 菜单跟随鼠标点击位置
- 自动调整位置确保菜单在视口内可见

### 实现
```tsx
// ContextMenu.tsx
const adjustedX = Math.min(x, window.innerWidth - menuWidth - 8);
const adjustedY = Math.min(y, window.innerHeight - menuHeight - 8);
// 确保菜单位于点击位置下方/上方（根据空间自动翻转）
```

---

## 问题 3：.md 文件后缀处理

### 现状
- 文件名直接显示 `笔记.md`
- 创建时需要手动输入 `.md`

### 目标
- **显示时**：隐藏 `.md` 扩展名
- **创建时**：不需要输入扩展名，系统自动追加

### 实现

**TreeNode.tsx - 显示时去掉后缀：**
```tsx
const displayName = node.name.replace(/\.md$/, '');
<span className="truncate text-sm">{displayName}</span>
```

**VaultTree.tsx - 创建时不追加后缀：**
```tsx
const handleDialogConfirm = useCallback((value: string) => {
  // 如果用户输入了 .md，去掉它
  const cleanName = value.replace(/\.md$/, '');
  if (dialog.type === 'newFile') {
    // createNote 会自动追加 .md
    vaultService.createNote(dialog.parentPath || '', cleanName);
  }
  // ...
}, []);
```

---

## 问题 4：文件夹内文件选中态

### 现状（Bug）
```tsx
// TreeNode.tsx 第 112 行
isSelected={activeFile === node.path}  // ❌ 错误！
```
这个比较发生在递归渲染子节点时，`node.path` 是父文件夹路径，所以永远不匹配。

### 目标
点击文件夹内的文件时，正确高亮显示。

### 实现
```tsx
// 在 VaultTree.tsx 中给 TreeNode 传递正确的选中状态
// ❌ 错误：isSelected={activeFile === node.path}

// ✅ 正确：在递归时正确传递 child.path
<TreeNode
  key={child.path}
  node={child}
  isSelected={activeFile === child.path}  // 用 child.path
  // ...
/>
```

实际上 bug 在 VaultTree.tsx 第 134 行，应该用 `node.path` 而不是 `activeFile === node.path` 来判断当前节点。

---

## 问题 5：排序功能重构

### 现状
- 两个按钮：`ArrowUpDown`（切换升序/降序）+ expand/collapse
- 只有字母序升序/降序

### 目标
单一 icon，点击弹出 select，包含 6 种排序：
1. 按文件名 A-Z
2. 按文件名 Z-A
3. 按创建时间（最新优先）
4. 按创建时间（最早优先）
5. 按编辑时间（最新优先）
6. 按编辑时间（最早优先）

### 实现

**SidebarHeader.tsx：**
```tsx
const [showSortMenu, setShowSortMenu] = useState(false);

const sortOptions = [
  { value: 'name-asc', label: '按文件名 A-Z', icon: '📄' },
  { value: 'name-desc', label: '按文件名 Z-A', icon: '📄' },
  { value: 'created-desc', label: '按创建时间 ↓', icon: '📅' },
  { value: 'created-asc', label: '按创建时间 ↑', icon: '📅' },
  { value: 'modified-desc', label: '按编辑时间 ↓', icon: '✏️' },
  { value: 'modified-asc', label: '按编辑时间 ↑', icon: '✏️' },
];
```

**VaultTree.tsx - 排序状态：**
```tsx
const [sortBy, setSortBy] = useState<'name' | 'created' | 'modified'>('name');
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

// 排序逻辑
const sortedTree = [...tree].sort((a, b) => {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;

  let comparison = 0;
  if (sortBy === 'name') {
    comparison = a.name.localeCompare(b.name);
  } else if (sortBy === 'created') {
    comparison = a.createdAt - b.createdAt;
  } else if (sortBy === 'modified') {
    comparison = a.modifiedAt - b.modifiedAt;
  }

  return sortOrder === 'asc' ? comparison : -comparison;
});
```

---

## 明暗主题适配

所有组件使用 CSS 变量确保双主题支持：

| Token | Light | Dark |
|-------|-------|------|
| `bg-primary` | #ffffff | #1a1a2e |
| `bg-secondary` | #f8f9fa | #16162a |
| `text-primary` | #1f2937 | #e5e7eb |
| `accent` | #42b883 | #5fc495 |
| `border` | #e5e7eb | #2d2d44 |

---

## 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `PromptDialog.tsx` | 样式优化，添加阴影、主色按钮 |
| `ConfirmDialog.tsx` | 保持一致风格 |
| `ContextMenu.tsx` | 边界处理 |
| `TreeNode.tsx` | 显示时去掉 .md 后缀 |
| `SidebarHeader.tsx` | 排序下拉菜单 |
| `VaultTree.tsx` | 修复选中态 bug，6 种排序逻辑 |

---

## 验证标准

- [ ] Light 主题下所有组件显示正常
- [ ] Dark 主题下所有组件显示正常
- [ ] 文件名不显示 .md 后缀
- [ ] 新建文件输入 "untitled" → 创建 "untitled.md"
- [ ] 文件夹内文件点击有选中高亮
- [ ] 排序下拉显示 6 种选项
- [ ] 右键菜单位置跟随鼠标
