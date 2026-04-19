# Domain Logic - Core

`packages/core` 是纯 Node.js 领域逻辑层，不依赖 Electron、React 或浏览器 API。

## 当前目录结构

```text
src/
├── vault/      # 笔记读写、frontmatter 解析、目录级文件操作
├── graph/      # Wiki-links / tags 提取与图关系基础构建
├── search/     # 搜索契约与索引能力
├── plugins/    # 插件契约与生命周期
└── utils/      # 纯工具函数
```

## 渐进式指引

进入具体子模块时，优先读取更细一级的局部 `CLAUDE.md`：

- `src/vault/CLAUDE.md` - 笔记内容、frontmatter、文件路径与写入规则
- `src/graph/CLAUDE.md` - 内容提取、链接/标签解析、纯函数约束
- `src/search/CLAUDE.md` - 搜索契约、索引抽象、结果稳定性
- `src/plugins/CLAUDE.md` - 插件接口、生命周期和宿主边界

## 核心原则

- **纯 Node.js**：不引入 Electron、React 或 DOM 依赖。
- **单职责**：每个子模块只关注一个领域边界。
- **可测试**：优先纯函数、显式输入输出、可直接 import 测试。
- **调用方无关**：core 不知道自己被 renderer、main process、CLI 还是测试调用。

## 约束

- 共享契约若需要跨层复用，应优先考虑放到 `packages/dto`。
- 不要把 UI 行为、窗口状态、通知提示等上层概念混入 core。
- 如果逻辑只是在某个应用层成立，不要为了复用想象提前下沉到 core。
