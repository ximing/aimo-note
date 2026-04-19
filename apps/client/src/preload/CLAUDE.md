# Preload Bridge

`src/preload` 通过 `contextBridge` 把安全、最小化的 Electron 能力暴露给 renderer。

## 适用范围

- `contextBridge.exposeInMainWorld()` 暴露面设计
- `ipcRenderer.invoke/on/removeListener` 的包装
- 订阅型 API 的回调映射与清理
- renderer 可见的类型声明

## 当前代码特征

- `index.ts` 统一暴露 `window.electronAPI`。
- 既包含一次性调用，也包含 `on*` / `remove*` 这类订阅型监听接口。
- 当前实现使用 callback map 保存包装后的监听器，以支持正确解绑。

## 约束

- 只暴露 renderer 真正需要的最小 API 面，不要把 `ipcRenderer` 或 Node.js 能力直接透传出去。
- 新增事件订阅接口时，必须同时提供对应的移除监听能力，避免泄漏。
- 返回结构保持稳定、简单、可序列化；复杂对象优先在主进程消化。
- 修改 `window.electronAPI` 后，记得同步检查 renderer 侧 `apps/render/src/ipc/` 的 typed wrapper 是否仍然匹配。
