# Shared Types

## 目录说明

`packages/dto` 定义跨层共享的 TypeScript 接口。

## 当前文件

```
src/
├── index.ts      # 统一导出
└── response.ts   # 通用响应结构
```

## 约束

- 只放类型定义，不放实现
- 类型命名使用 PascalCase（`NoteMetadata`、`SearchResult`）
- 避免枚举，用联合类型替代
- 跨包使用的结构才放到这里，package 私有类型放各自目录

## 原则

- DTO 是 API 契约，改动需要考虑向后兼容
- 复杂类型提供 JSDoc 说明
- 避免循环依赖
