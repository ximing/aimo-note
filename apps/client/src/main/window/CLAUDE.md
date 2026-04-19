# Window Management

`src/main/window` 负责 BrowserWindow 的创建、恢复、显示/隐藏，以及窗口状态持久化。

## 适用范围

- `BrowserWindow` 配置
- `titleBarStyle`、最小尺寸、preload 配置
- ready-to-show / close / activate 等窗口生命周期
- 窗口位置尺寸保存与恢复
- 外部链接、新窗口、拖拽文件等原生窗口行为

## 当前代码特征

- 入口在 `manager.ts`，窗口状态存储在 `state.ts`。
- 当前应用默认使用单主窗口模型，并通过 `shared-state.ts` 持有引用。
- macOS 下使用 `titleBarStyle: 'hidden'`，窗口关闭时默认隐藏到后台而不是直接退出。
- 文件拖拽和外部链接行为都在 `webContents` 层处理。

## 约束

- 修改窗口行为时，优先保持 macOS / Windows / Linux 的行为差异清晰可读。
- 不要把 renderer 布局细节塞进这里；这里只负责原生窗口和 webContents 行为。
- 变更窗口关闭、恢复、聚焦逻辑时，同时检查 `src/main/index.ts` 里的 app 生命周期事件是否仍然匹配。
- 任何新增 preload、安全设置或 BrowserWindow webPreferences 变更，都要明确评估安全边界。
