## 目录说明

`src/ipc` 只存放 renderer 侧的 IPC 访问封装。
这里负责把 `window.electronAPI` 暴露的能力整理成稳定、可类型约束、可复用的前端调用接口。

这一层是 renderer 与 Electron preload / main process 之间的薄适配层，不负责业务状态管理，也不承载页面编排逻辑。

## 适用场景

- 对 `window.electronAPI.*` 做类型化封装
- 把底层 channel 调用收敛成语义清晰的方法，如 `vault.open()`
- 为 Service 提供稳定的基础调用能力
- 屏蔽 preload 注入细节，避免页面和组件直接访问全局对象

## 当前目录职责

### 单文件一类能力

每个文件对应一组领域能力，例如：

- `vault.ts`：笔记仓库相关调用
- `graph.ts`：图谱相关调用
- `search.ts`：搜索相关调用
- `plugin.ts`：插件相关调用
- `fs.ts`：文件系统相关调用
- `window.ts`：窗口控制相关调用

### `index.ts`

统一导出 IPC 模块，对上层隐藏目录细节。

## 推荐写法

### 1. 保持薄封装

IPC 层只做接口整理、参数透传、返回值类型约束。
不要在这里堆积业务逻辑、缓存、派生状态或 UI 相关处理。

```typescript
export interface Vault {
  open(path: string): Promise<{ path: string; files: number }>;
}

export const vault: Vault = {
  async open(path: string) {
    return window.electronAPI.vault.open(path);
  },
};
```

### 2. 先定义清晰接口，再导出实现

优先使用 `interface` 或共享类型描述能力边界，让调用方只依赖稳定契约。

```typescript
export interface Search {
  search(query: string, limit?: number): Promise<SearchResult[]>;
}

export const search: Search = {
  async search(query: string, limit = 50) {
    return window.electronAPI.search.query(query, limit);
  },
};
```

### 3. 目录内只依赖类型和底层桥接

`src/ipc` 可以依赖 `src/types`、`packages/dto` 或浏览器侧公共类型。
不要反向依赖页面组件、页面 Service 或具体 UI 实现。

## 与 Service 的关系

- `src/ipc`：负责跨进程调用适配
- `src/services`：负责应用级状态与业务编排
- `src/pages/*/*.service.ts`：负责页面级状态与交互流程

通常由 Service 调用 IPC，而不是由页面组件直接拼装底层调用细节。

## 约束

- 不要在组件里直接访问 `window.electronAPI`
- 不要在 IPC 层保存全局状态
- 不要在这里混入页面逻辑、通知提示、路由跳转等 UI 行为
- 方法命名优先表达业务语义，而不是底层 channel 名
- 返回值尽量显式类型化，避免大量 `unknown` 或隐式结构

## 新增代码时的默认约定

- 新增一类 IPC 能力时，优先新建独立文件，不要无序堆到已有模块
- 新增模块后同步更新 `src/ipc/index.ts`
- 如果某个能力主要服务于业务流程，逻辑放到 Service，IPC 只保留调用桥接
- 如果某个返回结构会被多处复用，优先提取到共享类型定义
