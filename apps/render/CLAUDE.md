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
