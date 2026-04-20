---
paths:
  - 'apps/client/src/main/**/*.ts'
  - 'apps/client/src/preload/**/*.ts'
---

# Electron Main Process Rules

- Main-process code owns native window behavior, menus, tray integration, IPC handlers, and updater wiring.
- Keep IPC handlers thin: validate/forward requests and delegate domain work to `packages/core` or other dedicated modules.
- Preload code should expose the smallest safe `contextBridge` surface needed by the renderer.
- Renderer code must go through typed IPC wrappers; do not bypass preload/main boundaries.
- When changing window behavior, inspect both `apps/client/src/main/index.ts` and `apps/client/src/main/window/manager.ts`.
