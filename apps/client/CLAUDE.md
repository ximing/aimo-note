# Electron Main Process

## 目录说明

`apps/client` 是 Electron 主进程，负责原生系统集成和核心能力调度。

## 当前目录结构

```
src/
├── main/              # 主进程入口
│   ├── index.ts      # 主进程启动
│   ├── window/       # 窗口管理
│   ├── menu/         # 应用菜单
│   ├── tray/         # 系统托盘
│   ├── ipc/          # IPC 处理器（桥接 renderer 到 core）
│   └── updater/      # 自动更新
├── preload/           # Preload 脚本（注入 electronAPI）
└── shared-state.ts   # 主从进程共享状态
```

## 核心职责

- **窗口管理**：`window/` 创建和管理 BrowserWindow
- **菜单/托盘**：`menu/`/`tray/` 处理系统菜单和托盘图标
- **IPC 调度**：`ipc/` 接收 renderer 请求，调用 core 包处理
- **自动更新**：`updater/` 处理应用更新逻辑

## IPC 处理器模式

主进程的 IPC 处理器负责把 renderer 请求转发给 core 包：

```typescript
// src/main/ipc/vault.ts
import { vault } from '@aimo-note/core';

ipcMain.handle('vault:open', async (_, path: string) => {
  return vault.open(path);
});
```

## Preload 注入

`preload/` 下的脚本通过 `contextBridge` 暴露安全 API 给 renderer。

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('electronAPI', {
  vault: { open: (path) => ipcRenderer.invoke('vault:open', path) },
});
```

## 约束

- 不要在主进程直接渲染 UI
- IPC handler 负责转发，不做业务逻辑
- preload 只暴露必要 API，不要泄漏 Node.js 能力
- renderer 永远通过 IPC 访问 core，不能绕过

## 与 core 包的关系

主进程是 core 包的用户，通过 `import { vault } from '@aimo-note/core'` 调用领域能力。
