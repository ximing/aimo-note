# Electron Main Process

`apps/client` 是 Electron 主进程侧代码，负责原生系统集成、窗口生命周期、preload 注入，以及把 renderer 请求桥接到更底层能力。

## 当前目录结构

```text
src/
├── main/                # 主进程入口与系统能力编排
│   ├── index.ts         # app 生命周期启动点
│   ├── ipc/             # IPC 处理器
│   ├── window/          # BrowserWindow 创建与状态持久化
│   ├── menu/            # 应用菜单与快捷键
│   ├── tray/            # 托盘集成
│   └── updater/         # 自动更新
├── preload/             # 安全暴露给 renderer 的桥接层
└── shared-state.ts      # 主进程共享状态
```

## 核心职责

- **窗口管理**：创建、恢复、隐藏和持久化 BrowserWindow 状态。
- **系统集成**：菜单、托盘、全局快捷键、自动更新。
- **IPC 调度**：接收 renderer 请求并转发到 Node.js / core 能力。
- **安全桥接**：通过 preload 暴露最小必要的 `electronAPI` 给 renderer。

## 渐进式指引

进入更具体的子树时，优先使用对应的局部 `CLAUDE.md`：

- `src/main/ipc/CLAUDE.md` - IPC channel、参数校验、错误返回与职责边界
- `src/main/window/CLAUDE.md` - BrowserWindow 生命周期、窗口状态、原生行为
- `src/main/menu/CLAUDE.md` - 应用菜单、平台差异与快捷键注册
- `src/main/tray/CLAUDE.md` - 托盘图标、托盘菜单与窗口可见性切换
- `src/main/updater/CLAUDE.md` - 自动更新流程、状态广播与安装时机
- `src/preload/CLAUDE.md` - `contextBridge` 暴露面、订阅清理、renderer 对接

## 约束

- 不要在主进程直接渲染 UI。
- IPC handler 负责桥接和边界控制，不承载页面编排逻辑。
- preload 只暴露必要 API，不要泄漏 Node.js 能力。
- renderer 必须通过 typed IPC wrapper 访问主进程，不要绕过 preload/main 边界。
- 涉及窗口行为时，至少同时检查 `src/main/index.ts` 和 `src/main/window/manager.ts`。

## 与 core 包的关系

主进程是 `packages/core` 的调用方，不应把 Electron 依赖下沉进 core。
