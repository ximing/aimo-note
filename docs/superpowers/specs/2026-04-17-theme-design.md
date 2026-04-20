# aimo-note 主题系统设计

## 概述

为 aimo-note 实现 Light / Dark 两套主题，基于 Vue 绿色 (#42b883) 作为主色，采用现代简约风格。

## 设计决策

| 决策项   | 选择                                          |
| -------- | --------------------------------------------- |
| 视觉风格 | 现代简约 (Modern Minimal)，类似 Linear/Notion |
| 暗色色调 | 深灰底 (#1a1a2e) + 冷色调                     |
| 主色     | Vue 绿 (#42b883)                              |
| 切换方式 | 仅设置页面                                    |
| 实现方案 | 基于现有 UIService 扩展 + CSS 变量            |

## 配色方案

### Light Theme

```css
--bg-primary: #ffffff;
--bg-secondary: #f8f9fa;
--bg-tertiary: #f1f3f5;
--text-primary: #1f2937;
--text-secondary: #6b7280;
--text-muted: #9ca3af;
--border: #e5e7eb;
--border-light: #f3f4f6;
--accent: #42b883;
--accent-light: #d1fae5;
--accent-hover: #3a9a6e;
--shadow: rgba(0, 0, 0, 0.08);
--shadow-lg: rgba(0, 0, 0, 0.12);
```

### Dark Theme

```css
--bg-primary: #1a1a2e;
--bg-secondary: #16162a;
--bg-tertiary: #0f0f1a;
--text-primary: #e5e7eb;
--text-secondary: #9ca3af;
--text-muted: #6b7280;
--border: #2d2d44;
--border-light: #252540;
--accent: #5fc495;
--accent-light: #1a3a2a;
--accent-hover: #6dd5a8;
--shadow: rgba(0, 0, 0, 0.3);
--shadow-lg: rgba(0, 0, 0, 0.5);
```

## 架构设计

```
UIService (已有，扩展)
├── theme: 'light' | 'dark' | 'system'  (用户选择)
├── resolvedTheme: 'light' | 'dark'     (计算后实际主题)
├── systemTheme: 'light' | 'dark'       (系统主题监听)
└── setTheme(theme)

useTheme() Hook (新增)
└── 返回 { theme, setTheme, themeOptions }

主题切换流程
用户选择 → UIService.setTheme() → useTheme() 订阅 → html 元素 class 切换
```

## 文件变更

| 文件                                  | 操作 | 说明                          |
| ------------------------------------- | ---- | ----------------------------- |
| `src/index.css`                       | 修改 | 添加 CSS 变量、dark mode 样式 |
| `src/hooks/useTheme.ts`               | 新增 | useTheme hook                 |
| `src/services/ui.service.ts`          | 修改 | 完善 theme 逻辑、连接 DOM     |
| `src/components/Layout.tsx`           | 修改 | 应用 html class               |
| `src/pages/settings/SettingsPage.tsx` | 修改 | 添加主题选择器                |
| `tailwind.config.js`                  | 修改 | 映射 CSS 变量到 Tailwind      |

## 组件设计

### useTheme Hook

```typescript
export function useTheme() {
  const ui = useService(UIService);
  return {
    theme: ui.resolvedTheme,
    setTheme: (t: Theme) => ui.setTheme(t),
    themeOptions: ui.theme,
  };
}
```

### Settings 页面主题选择器

三个卡片式选项：

- Light（太阳图标）
- Dark（月亮图标）
- System（显示器图标）

当前选中项有 accent 边框和背景高亮。

### Tailwind 颜色映射

```js
// tailwind.config.js
extend: {
  colors: {
    bg: {
      primary: 'var(--bg-primary)',
      secondary: 'var(--bg-secondary)',
      tertiary: 'var(--bg-tertiary)',
    },
    text: {
      primary: 'var(--text-primary)',
      secondary: 'var(--text-secondary)',
      muted: 'var(--text-muted)',
    },
    border: {
      DEFAULT: 'var(--border)',
      light: 'var(--border-light)',
    },
    accent: {
      DEFAULT: 'var(--accent)',
      light: 'var(--accent-light)',
      hover: 'var(--accent-hover)',
    },
  }
}
```

## 暗色模式实现

使用 Tailwind `darkMode: 'class'` 策略：

- HTML 元素添加 `class="dark"` 切换暗色
- CSS 变量在 `.dark` 选择器下覆盖

## 预览

预览文件：`docs/superpowers/specs/theme-preview.html`
