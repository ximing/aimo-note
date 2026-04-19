# Vault Module

`src/vault` 负责笔记仓库层的文件读写与内容解析，是最贴近 markdown 文件本体的 core 子模块。

## 适用范围

- 读取/写入 note 内容
- frontmatter 解析与序列化
- vaultPath + notePath 的路径组合
- 目录创建、文件落盘等 Node.js 文件操作

## 当前目录

- `reader.ts` - 读取文件并用 `gray-matter` 解析 frontmatter/body
- `writer.ts` - 写入文件并在需要时序列化 frontmatter
- `index.ts` - 对外导出的 Vault 契约

## 约束

- 保持接口围绕 `vaultPath` 与相对 `notePath`，不要引入应用级全局状态。
- `gray-matter` 相关处理应集中在这里，不要把 frontmatter 拼装分散到上层。
- 路径处理要显式、可测试，避免把平台相关路径假设泄漏给调用方。
- 不要引入 Electron、renderer 事件、窗口状态或 UI 语义。
- 如果新增返回结构可能跨层复用，优先考虑提取到 `packages/dto`。
