---
paths:
  - "apps/render/src/pages/**/*.{ts,tsx}"
---

# Renderer Page Rules

- Pages follow a fractal structure: keep page-local components, utils, types, and assets inside the page directory.
- Page state belongs in the page's own Service and should be bound from the page entry with `bindServices()`.
- Page Services may `resolve()` global Services, but page logic should not leak back into `src/services` unless it becomes cross-page.
- Only promote code into `src/components`, `src/utils`, or `src/types` after it is reused across multiple pages.
