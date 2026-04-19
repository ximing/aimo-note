# 图片对齐与大小调整功能设计

## 概述

为编辑器中的图片添加对齐方式控制（居左、居中、居右）和拖拽调整大小功能。用户通过浮动工具栏操作图片。

## 功能需求

| 功能 | 描述 |
|------|------|
| 图片对齐 | 支持左对齐、居中对齐、右对齐三种方式 |
| 拖拽调整大小 | 通过四角和四边手柄拖拽调整图片尺寸，支持等比缩放 |
| 默认对齐 | 新插入图片默认居中对齐 |
| 删除图片 | 通过工具栏删除按钮移除图片 |

## 用户交互

### 选中图片

- **触发方式**：单击图片
- **视觉反馈**：
  - 图片显示蓝色边框（`outline: 2px solid var(--accent)`）
  - 图片上方显示浮动工具栏
  - 图片四角和四边中点显示圆形拖拽手柄
- **取消选中**：点击图片外部区域，隐藏工具栏和手柄

### 工具栏操作

- 浮动工具栏浮现在图片上方，带向下小三角指向图片
- 工具栏包含：
  - **左对齐按钮**：三横线，左短右长
  - **居中对齐按钮**：三横线，左右对称（默认激活）
  - **右对齐按钮**：三横线，左长右短
  - **分隔线**
  - **删除按钮**：垃圾桶图标
- 点击对齐按钮立即切换对齐方式，当前激活按钮高亮显示
- 悬停图标显示 tooltip 提示功能，文本如下：
  - 左对齐按钮：`左对齐` / `Left align`
  - 居中对齐按钮：`居中` / `Center`
  - 右对齐按钮：`右对齐` / `Right align`
  - 删除按钮：`删除图片` / `Delete image`

### 拖拽调整大小

- **四角手柄**：支持自由缩放（宽高独立）
- **四边手柄**：支持单向拉伸
- **等比缩放**：按住 Shift 拖拽保持原图比例
- **尺寸约束**：
  - 最小宽度：40px
  - 最小高度：40px
  - 最大宽度：CSS `max-width: 100%`，即父容器宽度（即图片 wrapper 的宽度）
  - 等比缩放保护：拖拽开始前检查 `naturalWidth > 0`，若为 0 则等待图片加载完成后再允许拖拽
  - 拖拽期间：使用 `imageEl.parentElement?.offsetWidth` 计算最大宽度约束
- 拖拽时实时预览尺寸变化
- 拖拽结束后：将新的宽度值回写到 ProseMirror 节点属性（`width` 属性）

### 删除图片

1. 用户点击工具栏删除按钮
2. 执行 ProseMirror `deleteSelection` 命令
3. 清空选中状态，隐藏工具栏和手柄
4. 自动聚焦到上一个可编辑节点

## 技术实现

### 组件接口

#### ImageToolbarProps

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `alignment` | `'left' \| 'center' \| 'right'` | 是 | 当前对齐方式 |
| `position` | `{ top: number; left: number; width: number }` | 是 | 图片位置信息，用于定位工具栏 |
| `onAlign` | `(align: 'left' \| 'center' \| 'right') => void` | 是 | 对齐方式变更回调 |
| `onDelete` | `() => void` | 是 | 删除按钮回调 |
| `containerRef` | `React.RefObject<HTMLElement>` | 是 | 编辑器容器 ref，用于计算相对位置 |

#### ImageResizeHandlesProps

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `imageRef` | `React.RefObject<HTMLImageElement>` | 是 | 图片元素 ref |
| `onResizeStart` | `() => void` | 是 | 开始拖拽回调 |
| `onResize` | `(width: number, height: number) => void` | 是 | 拖拽中回调 |
| `onResizeEnd` | `(width: number, height: number) => void` | 是 | 拖拽结束回调 |

### 状态流

```
用户单击图片
    ↓
selectedImageNode = 点击的 ProsemirrorNode
selectedAlignment = 'center' (默认) 或从节点属性读取
    ↓
渲染 ImageToolbar + ImageResizeHandles
    ↓
用户点击对齐按钮
    ↓
更新 DOM class + 更新节点属性 (align)
    ↓
用户拖拽手柄
    ↓
onResize(width, height) → 更新图片 DOM width/height
    ↓
onResizeEnd(width, height) → 写入节点 width 属性到 ProseMirror
    ↓
用户点击删除
    ↓
执行 deleteSelection → 从文档删除节点
    ↓
selectedImageNode = null → 隐藏工具栏和手柄
```

### 工具栏定位

1. 获取图片的 `getBoundingClientRect()`
2. 获取编辑器容器的 `getBoundingClientRect()`
3. 计算相对位置：`top = imgRect.top - containerRect.top - toolbarHeight - offset(8px)`
4. **边界处理**：
   - 如果工具栏超出容器顶部，则显示在图片下方（`bottom` 定位）
   - 如果工具栏超出容器左右边界，则左右偏移保证不溢出
5. 工具栏宽度自适应图片宽度，最多不超过图片宽度

### 数据存储

对齐方式和宽度存储在节点属性中：

```typescript
interface ImageNodeAttrs {
  src: string;
  alt?: string;
  title?: string;
  align?: 'left' | 'center' | 'right';  // 新增
  width?: number;                        // 新增：用户拖拽设置的宽度（像素值）
}
```

### Markdown / HTML 序列化

- **`width`**：序列化为 `<img width="...">` HTML 属性
- **`align`**：序列化为 CSS 类名（`align-left` / `align-center` / `align-right`），通过 ProseMirror `addAttributes` 注册为 DOM 属性，与渲染层共用同一套 CSS 样式
- 序列化时优先使用 `width` 属性控制显示宽度，与 CSS `max-width: 100%` 配合实现响应式

### 渲染层实现

使用 ProseMirror 装饰器（decoration）动态添加 wrapper div 和手柄：

1. **不需要修改 Markdown 源**：wrapper 是在渲染层动态注入的 DOM
2. **对齐样式**：通过添加 `.align-left` / `.align-center` / `.align-right` 类名实现
3. **选中状态**：通过添加 `.is-selected` 类名实现
4. **属性持久化**：拖拽结束时，通过事务更新节点属性

### CSS 样式

在 `editor-content.css` 中添加：

```css
/* 图片包装器 */
.ProseMirror .image-wrapper {
  position: relative;
  display: block;
  margin: 1em 0;
  text-align: center; /* 默认居中 */
}

.ProseMirror .image-wrapper.align-left {
  text-align: left;
}

.ProseMirror .image-wrapper.align-center {
  text-align: center;
}

.ProseMirror .image-wrapper.align-right {
  text-align: right;
}

/* 选中状态 */
.ProseMirror .image-wrapper.is-selected > img,
.ProseMirror img.ProseMirror-selectednode {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* 工具栏 */
.image-toolbar {
  position: absolute;
  z-index: 100;
  background: #1a1a1a;
  border-radius: 8px;
  padding: 6px 8px;
  display: flex;
  gap: 2px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transform: translateX(-50%);
}

/* 拖拽手柄 */
.resize-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: white;
  border: 2px solid var(--accent);
  border-radius: 50%;
  cursor: pointer;
  z-index: 10;
}
```

### 拖拽实现

```typescript
const handleResize = (e: MouseEvent, handle: HandlePosition) => {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const imageEl = imageRef.current;
  if (!imageEl) return;

  // 记录原始尺寸
  const origWidth = imageEl.naturalWidth;
  const origHeight = imageEl.naturalHeight;
  const styleWidth = parseInt(imageEl.style.width) || imageEl.offsetWidth;

  const MIN_WIDTH = 40;
  const MAX_WIDTH = imageEl.parentElement?.offsetWidth || 800;

  const onMouseMove = (moveEvent: MouseEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;

    let newWidth: number;

    switch (handle) {
      case 'se': // 右下角：自由缩放
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, styleWidth + dx));
        break;
      case 's': // 下边中点：仅改变高度
        const newHeight = Math.max(MIN_HEIGHT, styleHeight + dy);
        imageEl.style.height = `${newHeight}px`;
        break;
      case 'e': // 右边中点：仅改变宽度
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, styleWidth + dx));
        break;
      case 'sw': // 左下角：调整宽度 + 调整 left
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, styleWidth - dx));
        imageEl.style.width = `${newWidth}px`;
        imageEl.style.marginLeft = `${parseInt(imageEl.style.marginLeft || '0') + dx}px`;
        break;
      case 'w': // 左边中点：调整宽度 + 调整 marginLeft
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, styleWidth - dx));
        imageEl.style.width = `${newWidth}px`;
        imageEl.style.marginLeft = `${parseInt(imageEl.style.marginLeft || '0') + dx}px`;
        break;
      case 'nw': // 左上角：自由缩放 + 调整 marginLeft + 调整 marginTop
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, styleWidth - dx));
        imageEl.style.width = `${newWidth}px`;
        imageEl.style.marginLeft = `${parseInt(imageEl.style.marginLeft || '0') + dx}px`;
        imageEl.style.marginTop = `${parseInt(imageEl.style.marginTop || '0') + dy}px`;
        break;
      case 'n': // 上边中点：调整高度 + 调整 marginTop
        const newHeightN = Math.max(MIN_HEIGHT, styleHeight - dy);
        imageEl.style.height = `${newHeightN}px`;
        imageEl.style.marginTop = `${parseInt(imageEl.style.marginTop || '0') + dy}px`;
        break;
      case 'ne': // 右上角：自由缩放 + 调整 marginTop
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, styleWidth + dx));
        imageEl.style.width = `${newWidth}px`;
        imageEl.style.marginTop = `${parseInt(imageEl.style.marginTop || '0') + dy}px`;
        break;
    }

    if (moveEvent.shiftKey) {
      // 等比缩放
      const ratio = origWidth / origHeight;
      imageEl.style.width = `${newWidth}px`;
      imageEl.style.height = `${newWidth / ratio}px`;
    } else {
      imageEl.style.width = `${newWidth}px`;
    }

    onResize(imageEl.offsetWidth, imageEl.offsetHeight);
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    onResizeEnd(imageEl.offsetWidth, imageEl.offsetHeight);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};
```

### 边界情况处理

| 情况 | 处理方式 |
|------|----------|
| 图片加载失败 | 不显示手柄，工具栏只显示删除按钮 |
| 图片被外部删除 | 工具栏自动隐藏 |
| 图片在折叠区域内 | 工具栏不可见，不处理选中 |
| 工具栏超出视口 | 调整位置到可见区域（上方/下方/左右偏移） |
| naturalWidth 为 0（图片未加载完成） | 禁止拖拽开始，等图片加载完成后再允许 |
| 四角/侧边自由缩放超出最小高度 | 同步限制最小高度 40px |
| 图片在折叠区域内被脚本操作 | 操作被拒绝，等待图片进入可见状态 |
| 拖拽期间文本选择 | 拖拽开始时对图片元素调用 `setPointerCapture`，同时设置 `user-select: none` 防止选中文本 |

### 交互范围约定

- **单图操作**：当前版本仅支持单张图片操作，不支持多选批量对齐
- **撤销/重做**：所有操作（对齐、缩放、删除）均通过 ProseMirror 事务执行，自动进入撤销栈，无需特殊处理
- **工具栏宽度**：由内容撑开，最小宽度由按钮数量决定，不会主动截断

## 文件清单

| 文件 | 操作 | 改动范围 |
|------|------|----------|
| `apps/render/src/components/editor/ImageToolbar.tsx` | 新增 | 完整新文件 |
| `apps/render/src/components/editor/ImageResizeHandles.tsx` | 新增 | 完整新文件 |
| `apps/render/src/styles/editor-content.css` | 修改 | 在 `/* Images */` 区块后追加 `.image-wrapper.*`、`.image-toolbar`、`.resize-handle` 样式 |
| `apps/render/src/components/editor/MilkdownEditorInner.tsx` | 修改 | 添加选中状态、图片点击事件、渲染 ImageToolbar + ImageResizeHandles |

## 实现顺序

1. 添加 CSS 样式（对齐类名、工具栏、手柄）
2. 实现 `ImageResizeHandles.tsx` 拖拽手柄组件
3. 实现 `ImageToolbar.tsx` 工具栏组件
4. 在 `MilkdownEditorInner` 中添加选中状态管理和工具栏集成
5. 通过 Milkdown `addAttributes` 配置注册 `align` 和 `width` 属性（无需自定义 plugin）
6. 实现拖拽结束后的属性回写（通过 ProseMirror 事务更新节点属性）
7. 测试三种对齐方式和拖拽缩放
