# 图片对齐与大小调整功能设计

## 概述

为编辑器中的图片添加对齐方式控制（居左、居中、居右）和拖拽调整大小功能。用户通过浮动工具栏操作图片。

## 功能需求

| 功能 | 描述 |
|------|------|
| 图片对齐 | 支持左对齐、居中对齐、右对齐三种方式 |
| 拖拽调整大小 | 通过四角和四边手柄拖拽调整图片尺寸，支持等比缩放 |
| 默认对齐 | 新插入图片默认居中对齐 |

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
- 悬停图标显示 tooltip 提示功能

### 拖拽调整大小

- **四角手柄**：支持自由缩放（宽高独立）
- **四边手柄**：支持单向拉伸
- **等比缩放**：按住 Shift 拖拽保持原图比例
- 拖拽时实时预览尺寸变化

## 技术实现

### 组件结构

```
ImageToolbar.tsx          # 浮动工具栏组件
├── AlignLeftButton
├── AlignCenterButton
├── AlignRightButton
└── DeleteButton

ImageResizeHandles.tsx    # 拖拽手柄组件
├── CornerHandle (x4)
└── EdgeHandle (x4)
```

### 状态管理

在 `MilkdownEditorInner` 中新增图片选中状态：

```typescript
const [selectedImageNode, setSelectedImageNode] = useState<ProsemirrorNode | null>(null);
```

### 工具栏定位

工具栏定位在图片上方居中，通过计算图片的 `getBoundingClientRect()` 获取位置。

### Markdown 存储

对齐方式通过 `text-align` CSS 属性实现，不改变 Markdown 源代码：

```markdown
<!-- 居中图片 -->
<div style="text-align: center;">

</div>

<!-- 左对齐图片 -->
<div style="text-align: left;">

</div>
```

### CSS 样式

在 `editor-content.css` 中添加：

```css
.ProseMirror .image-wrapper {
  position: relative;
  display: block;
  margin: 1em 0;
}

.ProseMirror .image-wrapper img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
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

.ProseMirror .image-wrapper.is-selected img {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

### 拖拽实现

使用原生鼠标事件实现拖拽：

```typescript
const handleMouseDown = (e: MouseEvent) => {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const startWidth = imageElement.offsetWidth;
  const startHeight = imageElement.offsetHeight;

  const onMouseMove = (moveEvent: MouseEvent) => {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;

    if (moveEvent.shiftKey) {
      // 等比缩放
      const ratio = startWidth / startHeight;
      const newWidth = startWidth + dx;
      imageElement.style.width = `${newWidth}px`;
      imageElement.style.height = `${newWidth / ratio}px`;
    } else {
      // 自由缩放
      imageElement.style.width = `${startWidth + dx}px`;
      imageElement.style.height = `${startHeight + dy}px`;
    }
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};
```

## 文件清单

| 文件 | 操作 |
|------|------|
| `apps/render/src/components/editor/ImageToolbar.tsx` | 新增 |
| `apps/render/src/components/editor/ImageResizeHandles.tsx` | 新增 |
| `apps/render/src/styles/editor-content.css` | 修改 |
| `apps/render/src/components/editor/MilkdownEditorInner.tsx` | 修改 |

## 实现顺序

1. 添加 CSS 样式（对齐类名）
2. 实现拖拽手柄组件
3. 实现工具栏组件
4. 在编辑器中集成工具栏和选中状态
5. 测试三种对齐方式和拖拽缩放

## 已知约束

- Milkdown 的图片节点可能需要包装层才能应用 text-align
- 拖拽缩放需要处理边界情况（最小/最大尺寸）
