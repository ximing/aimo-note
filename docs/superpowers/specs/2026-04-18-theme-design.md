# AIMO-Note 主题设计规范

## 概述

基于 Notion 风格的整体视觉重设计，目标是打造一个极简、克制、留白充足的笔记应用界面。

**设计原则**

- 不使用 border 进行区域分隔，优先使用背景色层次
- 轻阴影代替边框表达层级关系
- 统一圆角系统，柔和但不娘
- 紧凑高效的间距，信息密度适中

---

## 一、色彩系统

### 1.1 CSS 变量 Token

```css
/* Light Theme */
--bg-primary: #ffffff;      /* 主内容区背景 */
--bg-secondary: #f7f7f7;   /* 次级区域背景 */
--bg-tertiary: #ebebeb;    /* 三级区域（Left Rail） */
--bg-quaternary: #e0e0e0;  /* 四级区域（hover 态等） */

--text-primary: #1f1f1f;   /* 主文字 */
--text-secondary: #6e6e6e; /* 次级文字 */
--text-muted: #999999;     /* 弱化文字 */

--accent: #4ade80;         /* 强调色-绿 */
--accent-hover: #22c55e;  /* 强调色悬停 */
--accent-subtle: #f0fdf4; /* 强调色浅底 */

--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);

/* Dark Theme - TBD */
/* 暗色模式设计待后续单独迭代，当前保持现有炭灰底不变。 */
/* 规划值（暂不启用）:
--bg-primary: #1a1a1b;
--bg-secondary: #252525;
--bg-tertiary: #1e1e1e;
--bg-quaternary: #333333;
--text-primary: #cccccc;
--text-secondary: #999999;
--text-muted: #666666;
--accent: #4ade80;
--accent-hover: #6ee7a0;
--accent-subtle: #1a3a2a;
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.6);
*/

### 1.2 语义化映射

| 用途 | Token |
|------|-------|
| 主内容背景 | `--bg-primary` |
| 面板/侧边背景 | `--bg-secondary` |
| 导航栏背景 | `--bg-tertiary` |
| 悬浮背景 | `--bg-quaternary` |
| 文字 | `--text-primary` |
| 次级文字 | `--text-secondary` |
| 弱化文字 | `--text-muted` |
| 强调色 | `--accent` |

---

## 二、圆角系统

| 元素类型 | 圆角值 |
|----------|--------|
| 面板/卡片 | 6px |
| 按钮 | 6px |
| 输入框 | 6px |
| 小标签 | 4px |
| 图标按钮 | 50%（圆形） |

---

## 三、阴影系统

| 层级 | 用途 | CSS |
|------|------|-----|
| SM | 卡片悬浮、微弱突出 | `0 1px 2px rgba(0,0,0,0.05)` |
| MD | 下拉菜单、popover | `0 2px 8px rgba(0,0,0,0.08)` |
| LG | 模态框、对话框 | `0 8px 24px rgba(0,0,0,0.12)` |

---

## 四、间距系统

| 级别 | 数值 | 用途 |
|------|------|------|
| xs | 4px | 紧凑元素间距 |
| sm | 8px | 同类元素间距 |
| md | 12px | 组件内间距 |
| lg | 16px | 区块间距 |
| xl | 24px | 页面边距 |

---

## 五、布局规范

### 5.1 整体结构

```

┌─────────────────────────────────────────────────────────┐
│ Title Bar (40px) │
│ bg: --bg-secondary, no border │
├────┬──────────────┬────────────────────┬───────────────┤
│ │ │ │ │
│ L │ Explorer │ Editor Tabs │ Side Panel │
│ e │ (256px) │ (36px) │ (280px) │
│ f │ │ │ │
│ t │ bg: primary ├────────────────────┤ bg: secondary│
│ │ │ Editor Container │ │
│ R │ │ bg: primary │ │
│ a │ │ │ │
│ i │ │ │ │
│ l │ │ │ │
│ 48 │ │ │ │
│ px │ │ │ │
└────┴──────────────┴────────────────────┴───────────────┘

````

### 5.2 Title Bar

- 高度：40px
- 背景：`--bg-secondary`
- 底部分隔：移除 border，改用 1px 渐变线（--bg-secondary → --bg-primary）
  ```css
  border-bottom: 1px solid #f7f7f7; /* 单色分隔线即可 */
````

### 5.3 Left Rail

- 宽度：48px（固定）
- 背景：`--bg-tertiary`
- 图标按钮：圆形，hover 显示 accent 色
- 无边框分隔

### 5.4 Explorer（文件树）

- 宽度：256px（可调）
- 背景：`--bg-primary`
- 头部区域：背景 `--bg-secondary`（通过 padding 分隔，不用 border）
- 折叠/展开按钮：hover 时背景 `--bg-quaternary`（确保可见性）

### 5.5 Editor Tabs

- 高度：36px
- 背景：`--bg-secondary`
- 激活标签：
  - 背景：`--bg-primary`
  - 底部：2px `--accent` 色条（不用 border）
- 关闭按钮：hover tab 时显示

### 5.6 Editor Container

- 背景：`--bg-primary`
- 内边距：24px
- 移除 border 和 margin

### 5.7 Side Panel

- 宽度：280px（可调，200-600px）
- 背景：`--bg-secondary`（与主内容区分）
- 头部：`--bg-tertiary` 背景
- 悬浮时轻微阴影

---

## 六、组件规范

### 6.1 按钮

```css
/* 次要按钮 */
.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  border-radius: 6px;
  padding: 8px 16px;
}
.btn-secondary:hover {
  background: var(--bg-secondary);
}

/* 主要按钮 */
.btn-primary {
  background: var(--accent);
  color: white;
  border-radius: 6px;
  padding: 8px 16px;
}
.btn-primary:hover {
  background: var(--accent-hover);
}

/* 图标按钮 */
.btn-icon {
  background: transparent;
  border-radius: 50%;
  padding: 6px;
}
.btn-icon:hover {
  background: var(--bg-quaternary);
}

/* 禁用态 */
.btn-secondary:disabled,
.btn-primary:disabled,
.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-secondary:disabled:hover,
.btn-primary:disabled:hover,
.btn-icon:disabled:hover {
  background: transparent;
}
```

### 6.2 文件树节点（TreeNode）

```css
.tree-item {
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.tree-item:hover {
  background: var(--bg-secondary);
}

.tree-item.selected {
  background: var(--bg-tertiary);
  /* 左边条 accent 色 */
  box-shadow: inset 3px 0 0 var(--accent);
}
```

### 6.3 Editor Tab

```css
.editor-tab {
  padding: 8px 12px;
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}

.editor-tab:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.editor-tab.active {
  background: var(--bg-primary);
  color: var(--text-primary);
  /* 底部 accent 条 */
  box-shadow: inset 0 -2px 0 var(--accent);
}
```

### 6.4 卡片式组件

用于设置面板、对话框、悬浮面板等。

```css
.card {
  background: var(--bg-primary);
  border-radius: 6px;
  box-shadow: var(--shadow-md);
  padding: 16px;
}
```

### 6.5 输入框

```css
.input {
  background: var(--bg-primary);
  border: 1px solid var(--bg-quaternary);
  border-radius: 6px;
  padding: 8px 12px;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}

.input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: var(--bg-secondary);
}
```

---

## 七、过渡动画

```css
/* 全局过渡 */
transition:
  background-color 0.2s ease,
  color 0.2s ease,
  box-shadow 0.2s ease,
  border-color 0.2s ease;
```

| 场景                      | 时长  |
| ------------------------- | ----- |
| 颜色变化（hover、active） | 150ms |
| 面板展开/收起             | 200ms |
| 模态框出现                | 250ms |
| 下拉菜单                  | 150ms |

---

## 八、实现清单

### 8.1 CSS 变量重构

- [ ] 更新 `--bg-*` 变量值
- [ ] 更新 `--accent` 为 #4ade80
- [ ] 新增 `--shadow-*` 变量
- [ ] 添加暗色模式变量覆盖

### 8.2 布局组件更新

- [ ] Layout.tsx - 移除所有 border
- [ ] LeftRail.tsx - 当前使用 `bg-bg-secondary`，应改为 `bg-bg-tertiary`
- [ ] EditorTabs.tsx - 用 box-shadow 替代 border
- [ ] SidePanel.tsx - 更新背景色

### 8.3 通用组件更新

- [ ] 按钮样式统一
- [ ] TreeNode - 选中态改为左边条
- [ ] 设置弹窗/对话框 - 卡片化
- [ ] 输入框样式

### 8.4 工具类

- [ ] Tailwind 配置映射更新
- [ ] scrollbar 样式适配

---

## 九、注意事项

1. **border-first → shadow-first**：设计师惯于用 border 分隔，实现时需要主动替换为阴影或背景色
2. **Notion 的克制**：Notion 几乎不用阴影，主要靠背景色和留白；我们的卡片会稍带阴影但保持轻盈
3. **暗色待定**：当前暗色模式暂不变，后续单独迭代
4. **可访问性**：确保对比度符合 WCAG AA 标准
