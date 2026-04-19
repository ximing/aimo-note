# Plugin System

`src/plugins` 定义插件系统的核心契约与生命周期，是宿主能力与插件实现之间的边界层。

## 适用范围

- 插件接口与 manifest 风格结构
- 生命周期钩子（load / unload / hooks）
- 宿主向插件暴露的最小 API 面

## 当前代码特征

- `index.ts` 目前定义了 `Plugin`、`PluginHooks`、`PluginAPI` 以及简单的 `createPluginSystem()`。
- 现有实现偏内存态、轻量级，主要承担契约和生命周期编排。

## 约束

- 插件 API 尽量保持最小、稳定，不要把宿主内部实现细节直接暴露出去。
- 生命周期调用要考虑幂等性和失败隔离，不要让单个插件轻易污染整个宿主状态。
- 不要在这里绑定 Electron 窗口、React 组件或 renderer 路由等上层概念。
- 当插件能力需要跨层共享类型时，优先评估是否应落到 `packages/dto`。
