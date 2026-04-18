# React SPA Entry

## 入口文件

```
src/
├── main.tsx         # React 应用入口
├── app.tsx          # 根组件
├── components/      # 通用组件
├── pages/          # 页面
├── services/       # 全局 Service
├── ipc/            # IPC 客户端封装
├── types/          # 前端类型
└── utils/          # 工具
```

## 全局模式

- React 19 + Vite 7 + Tailwind CSS 3.4 + React Router 7
- 使用 `@rabjs/react` 进行状态管理
- Milkdown v7 作为 Markdown 编辑器

## Service 注册

全局 Service 在 `main.tsx` 中通过 `register()` 注册：

```typescript
import { register } from '@rabjs/react';
import { VaultService } from '@/services/vault.service';
import { UIService } from '@/services/ui.service';

register(VaultService);
register(UIService);
```

## 路由

使用 React Router 7，路由配置在 `app.tsx` 或独立路由文件。

## 主题系统

### CSS 变量 Token

主题使用 CSS 变量实现 Light/Dark 两套主题，定义在 `src/index.css` 中：

| Token | Light | Dark | 用途 |
|-------|-------|------|------|
| `--bg-primary` | #ffffff | #1a1a2e | 主背景 |
| `--bg-secondary` | #f8f9fa | #16162a | 次级背景 |
| `--bg-tertiary` | #f1f3f5 | #0f0f1a | 三级背景 |
| `--text-primary` | #1f2937 | #e5e7eb | 主文字 |
| `--text-secondary` | #6b7280 | #9ca3af | 次级文字 |
| `--text-muted` | #9ca3af | #6b7280 | 弱化文字 |
| `--border` | #e5e7eb | #2d2d44 | 边框 |
| `--border-light` | #f3f4f6 | #252540 | 浅边框 |
| `--accent` | #42b883 | #5fc495 | 强调色（Vue绿） |
| `--accent-light` | #d1fae5 | #1a3a2a | 强调色浅 |
| `--accent-hover` | #3a9a6e | #6dd5a8 | 强调色悬停 |

### Tailwind 颜色映射

Tailwind 配置 (`tailwind.config.js`) 将 CSS 变量映射为语义化颜色类：

```js
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
```

### 使用方式

```tsx
// 在组件中使用 Tailwind 类
<div className="bg-bg-primary text-text-primary border-border">
  <button className="bg-accent text-white hover:bg-accent-hover">
    按钮
  </button>
</div>

// 或使用 useTheme hook 获取当前主题
import { useTheme } from '@/hooks/use-theme';

const MyComponent = observer(() => {
  const { theme, setTheme } = useTheme();
  return <div>当前主题: {theme}</div>;
});
```

### 主题切换

- 主题状态由 `UIService` 管理（`src/services/ui.service.ts`）
- 支持三种模式：`light` | `dark` | `system`
- 设置页面入口：`src/pages/settings/index.tsx`
