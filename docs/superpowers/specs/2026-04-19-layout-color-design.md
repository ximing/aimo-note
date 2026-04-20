# 布局色卡设计规范

## 目标

统一布局层次色彩，从外到内由深到浅渐变过渡，整体统一和谐。

## 布局层次（从外→内，由深→浅）

| 区域                  | CSS 变量       | Light 值  | Dark 值   | 用途               |
| --------------------- | -------------- | --------- | --------- | ------------------ |
| **外层** header-row   | `--bg-header`  | `#e2dfd8` | `#2f2f2f` | 最深，最顶部标题栏 |
| **外层** left-rail    | `--bg-rail`    | `#e8e6e0` | `#2a2a2a` | 次深，图标导航     |
| **中层** left-sidebar | `--bg-sidebar` | `#f2f1ed` | `#1e1e1e` | 文件树区域         |
| **内层** main-content | `--bg-primary` | `#ffffff` | `#191919` | 编辑器主区域       |

## 层级关系示意

```
         header-row (最深)
┌──────────────────────────────┐
│  left-rail    │              │
│    (次深)      │  main-content│
│               │  (最浅)       │
│  left-sidebar │              │
│    (中层)      │              │
└──────────────────────────────┘
```

从外到内：header > left-rail > left-sidebar > main-content，逐层渐浅。

## 配色原则

1. **渐进性** - 每层之间色差适中（约 5% 亮度差），过渡自然
2. **统一性** - header-row 统一颜色，不再区分 left/right
3. **可辨识性** - 足够对比度确保层次清晰，但不刺眼

## 实现要点

### 1. CSS 变量定义

在 `apps/render/src/index.css` 的 `:root` 和 `html.dark` 中添加新变量：

```css
:root {
  /* 布局层次色 */
  --bg-header: #e2dfd8;
  --bg-rail: #e8e6e0;
  --bg-sidebar: #f2f1ed;
  /* --bg-primary 已存在 */
}

html.dark {
  /* 布局层次色 */
  --bg-header: #2f2f2f;
  --bg-rail: #2a2a2a;
  --bg-sidebar: #1e1e1e;
  /* --bg-primary 已存在 */
}
```

### 2. 组件样式映射

| 组件         | CSS 类          | 使用变量            |
| ------------ | --------------- | ------------------- |
| Header Row   | `.header-row`   | `var(--bg-header)`  |
| Left Rail    | `.left-rail`    | `var(--bg-rail)`    |
| Left Sidebar | `.left-sidebar` | `var(--bg-sidebar)` |
| Main Content | `.main-content` | `var(--bg-primary)` |

### 3. 修改文件

- `apps/render/src/index.css` - 添加 CSS 变量
- `apps/render/src/components/Layout.tsx` - 应用变量到 header-row
- `apps/render/src/components/left-rail.tsx` - 应用变量到 left-rail
- `apps/render/src/components/explorer/VaultTree.tsx` - 应用变量到 left-sidebar
