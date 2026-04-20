---
paths:
  - 'apps/render/src/components/**/*.tsx'
  - 'apps/render/src/components/**/*.ts'
---

# Renderer Component Rules

- `src/components` only stores components reused by multiple pages or reusable renderer shells.
- Prefer props-driven composition first; only read global Services directly when reuse genuinely needs shared app state.
- Wrap a component with `observer()` only when it reads observable state.
- Do not use `window.alert()`, `window.prompt()`, or `window.confirm()`; use shared dialog components instead.
- Update the nearest `index.ts` barrel when you add a new shared component.
