# Radix UI Context Menu 使用指南

本文档记录了项目中使用 `@radix-ui/react-context-menu` 实现右键菜单的方法和最佳实践。

## 安装

```bash
pnpm add @radix-ui/react-context-menu
```

当前版本: `2.2.16`

## 基本概念

Radix UI Context Menu 是一个无样式的、可访问的右键菜单组件，提供：

- 键盘导航支持（方向键、Enter、Escape）
- 自动碰撞检测（避免菜单超出视口）
- 无障碍支持（ARIA 属性）
- 完全可定制样式

## 组件结构

```tsx
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';

<ContextMenuPrimitive.Root>
  {/* 触发区域 - 右键点击此区域显示菜单 */}
  <ContextMenuPrimitive.Trigger asChild>
    <div>右键点击我</div>
  </ContextMenuPrimitive.Trigger>

  {/* Portal - 将菜单渲染到 body，避免 z-index 问题 */}
  <ContextMenuPrimitive.Portal>
    {/* 菜单内容容器 */}
    <ContextMenuPrimitive.Content className="your-content-styles">
      {/* 菜单项 */}
      <ContextMenuPrimitive.Item className="your-item-styles">菜单项 1</ContextMenuPrimitive.Item>

      {/* 分隔线 */}
      <ContextMenuPrimitive.Separator className="your-separator-styles" />

      {/* 分组标签 */}
      <ContextMenuPrimitive.Label className="your-label-styles">
        分组名称
      </ContextMenuPrimitive.Label>

      <ContextMenuPrimitive.Item className="your-item-styles">菜单项 2</ContextMenuPrimitive.Item>
    </ContextMenuPrimitive.Content>
  </ContextMenuPrimitive.Portal>
</ContextMenuPrimitive.Root>;
```

## 核心 API

### Root

根容器组件，管理菜单的打开/关闭状态。

| Prop    | 类型             | 说明                          |
| ------- | ---------------- | ----------------------------- |
| `dir`   | `'ltr' \| 'rtl'` | 文本方向                      |
| `modal` | `boolean`        | 是否为模态菜单（默认 `true`） |

### Trigger

触发区域，右键点击时显示菜单。

| Prop      | 类型      | 说明                                      |
| --------- | --------- | ----------------------------------------- |
| `asChild` | `boolean` | 是否将 props 传递给子元素而非渲染额外 DOM |

### Content

菜单内容容器。

| Prop               | 类型       | 默认值  | 说明               |
| ------------------ | ---------- | ------- | ------------------ |
| `loop`             | `boolean`  | `false` | 是否循环键盘导航   |
| `alignOffset`      | `number`   | `0`     | 对齐偏移量         |
| `avoidCollisions`  | `boolean`  | `true`  | 是否避免碰撞       |
| `collisionPadding` | `number`   | `0`     | 碰撞边距           |
| `onCloseAutoFocus` | `function` | -       | 关闭时自动聚焦回调 |

### Item

菜单项。

| Prop        | 类型       | 说明             |
| ----------- | ---------- | ---------------- |
| `disabled`  | `boolean`  | 是否禁用         |
| `onSelect`  | `function` | 选择时回调       |
| `textValue` | `string`   | 用于搜索的文本值 |

**Data Attributes:**

- `data-highlighted`: 高亮状态（键盘导航时）
- `data-disabled`: 禁用状态

### Separator

分隔线，用于视觉分组。

### Label

分组标签，用于语义化分组。

## 项目中的实现

### 声明式用法（推荐）

用于目录树等可以直接包裹触发元素的场景：

```tsx
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';

interface TreeNodeContextMenuProps {
  node: TreeNode | null;
  children: ReactNode;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
}

function TreeNodeContextMenu({
  node,
  children,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: TreeNodeContextMenuProps) {
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className={contentClassName} collisionPadding={8}>
          <ContextMenuPrimitive.Item
            className={itemClassName}
            onSelect={() => onNewFile(targetPath)}
          >
            <span className="w-4">
              <FileText size={14} />
            </span>
            新建文件
          </ContextMenuPrimitive.Item>
          {/* 更多菜单项... */}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}
```

使用时：

```tsx
<TreeNodeContextMenu
  node={node}
  onNewFile={handleNewFile}
  onNewFolder={handleNewFolder}
  onRename={handleRename}
  onDelete={handleDelete}
>
  <button>点击我</button>
</TreeNodeContextMenu>
```

### 命令式用法（特殊场景）

用于编辑器空白区域等无法直接包裹元素的场景，需要手动控制菜单位置：

```tsx
// 这种场景不使用 Radix UI，而是手动实现
// 因为 Radix UI 的 ContextMenu 必须包裹一个 Trigger 元素

function ContextMenu({ x, y, onClose, ...props }) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div ref={menuRef} className={contentClassName} style={{ left: x, top: y, position: 'fixed' }}>
      {/* 菜单项... */}
    </div>
  );
}
```

## 样式指南

### 推荐的样式类

```css
/* 菜单容器 */
.context-menu-content {
  z-index: 50;
  min-width: 180px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  padding: 4px 0;
  overflow: hidden;
}

/* 菜单项 */
.context-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  text-align: left;
  width: 100%;
  cursor: default;
  user-select: none;
  outline: none;
}

/* 高亮状态（键盘导航/悬停） */
.context-menu-item[data-highlighted] {
  background-color: var(--accent);
  color: white;
}

/* 禁用状态 */
.context-menu-item[data-disabled] {
  opacity: 0.5;
  pointer-events: none;
}

/* 危险操作 */
.context-menu-item.danger {
  color: var(--destructive);
}

.context-menu-item.danger[data-highlighted] {
  color: var(--destructive);
}

/* 分隔线 */
.context-menu-separator {
  height: 1px;
  background-color: var(--border);
  margin: 4px 4px;
}

/* 分组标签 */
.context-menu-label {
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

### Tailwind CSS 内联样式

```tsx
const contentClassName =
  'z-50 min-w-[180px] bg-bg-primary border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.2)] py-1 overflow-hidden';

const itemClassName =
  'flex items-center gap-2 px-3 py-2 text-sm text-text-primary text-left w-full cursor-default select-none outline-none data-[highlighted]:bg-accent data-[highlighted]:text-white data-[disabled]:opacity-50 data-[disabled]:pointer-events-none';

const separatorClassName = 'h-px bg-border my-1 mx-1';

const labelClassName =
  'px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide';
```

## 子菜单

使用 `ContextMenu.Sub` 实现嵌套子菜单：

```tsx
<ContextMenuPrimitive.Root>
  <ContextMenuPrimitive.Trigger asChild>
    <div>触发区域</div>
  </ContextMenuPrimitive.Trigger>

  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content>
      <ContextMenuPrimitive.Item>菜单项 1</ContextMenuPrimitive.Item>

      {/* 子菜单 */}
      <ContextMenuPrimitive.Sub>
        <ContextMenuPrimitive.SubTrigger>更多选项 →</ContextMenuPrimitive.SubTrigger>

        <ContextMenuPrimitive.Portal>
          <ContextMenuPrimitive.SubContent>
            <ContextMenuPrimitive.Item>子菜单项 1</ContextMenuPrimitive.Item>
            <ContextMenuPrimitive.Item>子菜单项 2</ContextMenuPrimitive.Item>
          </ContextMenuPrimitive.SubContent>
        </ContextMenuPrimitive.Portal>
      </ContextMenuPrimitive.Sub>
    </ContextMenuPrimitive.Content>
  </ContextMenuPrimitive.Portal>
</ContextMenuPrimitive.Root>
```

## 可勾选菜单项

使用 `ContextMenu.CheckboxItem` 实现可勾选的菜单项：

```tsx
<ContextMenuPrimitive.CheckboxItem
  checked={isChecked}
  onCheckedChange={setIsChecked}
  className="your-checkbox-item-styles"
>
  <ContextMenuPrimitive.ItemIndicator>
    <CheckIcon />
  </ContextMenuPrimitive.ItemIndicator>
  显示隐藏文件
</ContextMenuPrimitive.CheckboxItem>
```

## 最佳实践

1. **使用 `asChild` 避免额外 DOM** - Trigger 使用 `asChild` 可以将 props 传递给子元素，避免渲染额外的包装元素。

2. **使用 Portal** - 始终使用 `Portal` 渲染菜单内容，避免 z-index 问题和父容器的 `overflow: hidden` 影响。

3. **碰撞检测** - 设置 `collisionPadding` 确保菜单在视口边缘时能正确调整位置。

4. **键盘导航** - 不要覆盖默认的键盘行为，Radix UI 已提供完善的键盘支持。

5. **无障碍** - 如果菜单项只有图标，设置 `textValue` 属性提供屏幕阅读器可读的文本。

6. **分组** - 使用 `Label` 和 `Separator` 对菜单项进行逻辑分组，提升用户体验。

## 相关文件

- `apps/render/src/components/common/ContextMenu.tsx` - 项目中的实现
- `apps/render/src/components/explorer/TreeNode.tsx` - 目录树中的使用示例

## 参考链接

- [Radix UI Context Menu 官方文档](https://www.radix-ui.com/primitives/docs/components/context-menu)
- [Radix UI Primitives GitHub](https://github.com/radix-ui/primitives)
