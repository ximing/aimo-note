# IPC Handlers

`src/main/ipc` 是 renderer 与主进程/Node.js 能力之间的桥接层。

## 适用范围

- `ipcMain.handle()` / `ipcMain.on()` 注册
- channel 命名与参数传递
- 错误捕获、序列化返回值、最小输入校验
- 把请求转发到 `packages/core`、Node.js 文件系统、系统 API 或 updater

## 目录职责

- 这里负责边界控制，不负责页面状态和 UI 行为。
- handler 应该尽量薄：接收请求、校验/整理参数、调用底层能力、返回可序列化结果。
- renderer 可读的返回结构应保持稳定，避免随意变形。

## 当前代码特征

- `handlers.ts` 同时承担 secure store、recent vault、update、vault 相关 channel。
- 返回值普遍采用 `{ success, error?, ... }` 结构；新增 handler 时保持风格一致。
- 文件系统递归、dialog 选择目录等 Electron/Node 细节留在这一层或再向下提炼，不要泄漏到 renderer。

## 约束

- 不要在 handler 里堆积业务编排、缓存或页面逻辑。
- 尽量把领域逻辑交给 `packages/core`，不要把 core 能力重新写一遍。
- 错误返回要可序列化、可供 renderer 展示，不要直接抛出复杂对象。
- 需要新增 `electronAPI` 能力时，记得同步检查 `src/preload/` 和 renderer 侧 `apps/render/src/ipc/` 封装是否保持一致。
