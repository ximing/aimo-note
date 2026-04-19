# Table Context Menu 设计文档

**日期：** 2026-04-19
**状态：** Draft

---

## 1. 概述

为编辑器中的表格添加右键菜单，支持在选中单元格后通过右键菜单进行插入行/列、删除行/列操作。

## 2. 现状分析

- 表格由 Milkdown GFM preset 内置实现，无自定义节点
- 无表格单元格选中状态追踪
- 无编辑器内右键菜单（现有 ContextMenu 仅用于文件树）
- 选中单元格沿用 ProseMirror 内置 `.selectedCell` CSS 高亮

## 3. 设计决策

### 交互方式
- 点击单元格 → 高亮选中（`.selectedCell`）
- 在选中单元格上右键 → 弹出浮动菜单
- 点击菜单项 → 执行对应命令并关闭菜单

### 菜单位置
- 跟随鼠标光标，自动调整避免超出视口（参考现有 `ContextMenu.tsx` 的实现）

### 菜单操作项
| 操作 | 命令 | 说明 |
|------|------|------|
| 向左插入列 | `addColBeforeCommand` | 在当前列左侧插入新列 |
| 向右插入列 | `addColAfterCommand` | 在当前列右侧插入新列 |
| 向上插入行 | `addRowBeforeCommand` | 在当前行上方插入新行 |
| 向下插入行 | `addRowAfterCommand` | 在当前行下方插入新行 |
| 删除当前列 | `deleteSelectedCellsCommand` | 删除当前列（需多列选中时） |
| 删除当前行 | `deleteSelectedCellsCommand` | 删除当前行（需多行选中时） |

**注意：** 删除行列使用同一个 `deleteSelectedCellsCommand`，内部会根据 CellSelection 的类型（行选择/列选择）自动判断删除行为。单单元格选中时，默认删除整行或整列（取决于光标位置）。

## 4. 架构设计

### 4.1 新增文件

```
apps/render/src/components/editor/
├── TableContextMenu.tsx    # 新增：表格右键菜单组件
└── MilkdownEditorInner.tsx # 修改：添加表格选择状态追踪和菜单触发
```

### 4.2 状态管理（MilkdownEditorInner.tsx）

在现有图片选中状态管理附近添加：

```typescript
// 表格选择状态
const [tableContextMenu, setTableContextMenu] = useState<{
  x: number;
  y: number;
  rowIndex: number;
  colIndex: number;
} | null>(null);

// 同步表格选择状态（新增方法）
const syncTableSelection = useCallback(() => {
  const { state } = editorViewRef.current;
  if (!isInTable(state)) return;
  // 使用 cellAround 或 CellSelection 检测选中单元格
  // 记录 rowIndex, colIndex
}, []);
```

### 4.3 右键菜单触发

- 在 `.ProseMirror` 容器上监听 `contextmenu` 事件
- 判断当前光标位置是否在表格内（`isInTable`）
- 获取当前单元格索引（`findCell` / `cellAround`）
- 计算菜单位置，显示菜单

### 4.4 命令执行

通过 Milkdown commands API 执行：

```typescript
const commands = ctx.get(commandsCtx);

// 插入列
commands.call(addColBeforeCommand.key);  // 向左插入
commands.call(addColAfterCommand.key);   // 向右插入

// 插入行
commands.call(addRowBeforeCommand.key);  // 向上插入
commands.call(addRowAfterCommand.key);   // 向下插入

// 删除行列（需先选中行/列）
if (isColSelection) {
  commands.call(deleteSelectedCellsCommand.key);
} else if (isRowSelection) {
  commands.call(deleteSelectedCellsCommand.key);
}
```

### 4.5 删除行列的边界处理

- 表格只有一行时，禁用"删除当前行"
- 表格只有一列时，禁用"删除当前列"
- 检测方式：使用 `selectedRect(state)` 获取行列数

## 5. UI 设计

### 5.1 菜单样式

参考现有 `ContextMenu.tsx` 风格：

- 背景：`var(--bg-secondary)`
- 边框：`1px solid var(--border)`
- 圆角：`8px`
- 内边距：`4px 0`
- 阴影：`0 4px 12px rgba(0, 0, 0, 0.15)`

### 5.2 菜单项样式

```
┌────────────────────────┐
│  ← 向左插入列          │
│  → 向右插入列          │
│  ↑ 向上插入行          │
│  ↓ 向下插入行          │
│  ─────────────────────  │
│  ✕ 删除当前列          │
│  ✕ 删除当前行          │
└────────────────────────┘
```

- 每项高度：`32px`
- 图标 + 文字水平排列
- 分隔线使用 `───` 视觉分隔删除操作
- 禁用项：`opacity: 0.5`, `cursor: not-allowed`

### 5.3 位置计算

- `x`: 使用 `e.clientX`，若菜单右侧超出视口则左偏移
- `y`: 使用 `e.clientY`，若菜单下方超出视口则上偏移
- 最小边距：`8px`

## 6. 实现步骤

1. **创建 TableContextMenu.tsx**
   - 接收 `position`（x, y）、`onClose`、操作回调
   - 实现禁用状态逻辑（检测行列数）

2. **修改 MilkdownEditorInner.tsx**
   - 导入表格命令
   - 添加表格选择状态
   - 添加右键监听
   - 渲染 TableContextMenu

3. **样式调整**
   - 确保菜单样式与系统风格一致

## 7. 风险与注意事项

- **CellSelection 检测**：单单元格时 `cellAround` 返回 `null`，需要使用 `findCell`
- **命令上下文**：确保命令在表格内执行（`isInTable` 检查）
- **状态同步**：图片选中状态和表格选中状态需要互不干扰
