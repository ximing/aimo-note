# Auto Updater

`src/main/updater` 负责自动更新能力：检查新版本、下载更新、安装更新，以及把更新状态同步给 renderer。

## 适用范围

- `electron-updater` 配置
- 检查 / 下载 / 安装更新流程
- 更新事件监听与状态广播
- 系统通知与更新确认弹窗

## 当前代码特征

- `index.ts` 统一配置 `autoUpdater`，并导出 setup/check/download/install/event registration。
- 当前策略是检查更新但不自动下载，安装时机依赖用户确认或应用退出。
- 更新事件通过 `mainWindow?.webContents.send('update-status', ...)` 通知 renderer。
- 同时使用系统通知和对话框提示用户可用更新或已下载完成的更新。

## 约束

- 把更新状态结构保持稳定，避免随意修改 renderer 已依赖的 `update-status` 载荷。
- 更新流程中的用户提示、通知、安装时机要前后一致，不要出现“消息已发出但状态未同步”的分叉。
- 失败路径要可恢复、可记录，避免吞掉 `electron-updater` 错误。
- 不要把与更新无关的应用逻辑混进这里；这里只负责版本分发与安装链路。
- 任何改动若影响 renderer 展示，记得同步检查 preload 类型声明和 renderer 侧更新状态消费逻辑。
