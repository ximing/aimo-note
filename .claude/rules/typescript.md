---
paths:
  - "**/*.{ts,tsx}"
---

# TypeScript Rules

## Naming Conventions

- **Kebab-case** 文件名：`use-vault.ts`、`vault.service.ts`
- **Hook 文件**：`use-` 前缀 + kebab-case，如 `use-vault.ts`
- **Service 文件**：`.service.ts` 后缀，如 `vault.service.ts`
- **PascalCase** 类型/接口：`NoteMetadata`、`SearchResult`

## Type Annotations

- 导出的函数/方法使用显式返回类型
- 组件 props 使用 interface 定义
- 避免 `any`，优先使用 `unknown` + 类型守卫

## Imports

- 绝对路径使用 `@/` 前缀（如 `@/services/vault.service`）
- 类型导入使用 `import type`
- 相对路径避免超过 3 层 ../

## React/TSX

- 函数组件不需手动类型声明（TS 会推断）
- 事件处理函数显式类型化：`onClick={(e: MouseEvent) => ...}`
- 优先使用 `FC<Props>` 或直接解构 props
