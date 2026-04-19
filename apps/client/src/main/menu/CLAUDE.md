# Application Menu

`src/main/menu` 负责应用菜单栏与全局快捷键注册，是主进程里偏平台交互的一层。

## 适用范围

- `Menu.buildFromTemplate()` 菜单结构
- 菜单项 label、role、accelerator、click 行为
- 平台差异化菜单（macOS / Windows / Linux）
- 全局快捷键注册与释放

## 当前代码特征

- `manager.ts` 负责构建应用菜单模板并挂载到 Electron。
- `shortcuts.ts` 负责全局快捷键注册，当前仍有待补全的占位逻辑。
- 菜单里既包含标准 role 菜单，也包含项目自定义动作，例如显示主窗口、检查更新、访问 GitHub。

## 约束

- 优先复用 Electron 的 `role`，只有确实需要自定义行为时再写 `click`。
- 平台差异要集中表达，避免把 macOS 特殊处理散落到多个文件。
- 快捷键变更要与菜单显示、窗口行为和退出语义保持一致。
- 不要把复杂业务流程塞进菜单 click 回调；必要时调用更底层的专用模块。
- 若菜单动作会影响窗口状态或退出流程，记得同步检查 `shared-state` 与 `window/`、`updater/` 的行为是否匹配。
