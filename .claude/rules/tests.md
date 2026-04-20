---
paths:
  - '**/*.{test,spec}.ts'
  - '**/__tests__/**/*.ts'
---

# Test Rules

- Keep tests close to the package or module they verify.
- `packages/core` and `packages/logger` tests should import domain code directly without Electron dependencies.
- Prefer deterministic fixtures over hidden global state.
- When a behavior spans renderer and main process, keep the contract typed in `packages/dto` and test the domain logic at the lowest practical layer.
