---
paths:
  - "apps/render/src/services/**/*.ts"
  - "apps/render/src/pages/**/*.service.ts"
---

# Renderer Service Rules

- `apps/render/src/services` is for app-wide singleton Services only.
- Register global Services with `register()` in `src/main.tsx`; page-scoped Services should stay inside page directories and use `bindServices()`.
- Prefer dependency resolution through `resolve()` / `useService()` instead of manually instantiating Services.
- Keep Service boundaries directional: page Services can depend on global Services, but global Services should not depend on page-specific implementations.
- Exported APIs should keep explicit, readable types and avoid `any`.
