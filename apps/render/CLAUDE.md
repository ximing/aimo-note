# React SPA Entry

`apps/render` contains the Electron renderer application shell: React bootstrapping, global services, shared UI wiring, and the handoff to more specific `src/*` guidance.

## Entry Points

- `src/main.tsx` is the renderer bootstrap entry.
- `src/app.tsx` owns the router/app shell composition.
- `src/index.css` loads Tailwind base/components/utilities.
- `src/styles/index.css` loads the custom CSS architecture from `src/styles/`.

## Global Patterns

- React 19 + Vite 7 + Tailwind CSS 3.4 + React Router 7
- `@rabjs/react` for state management and dependency injection
- Milkdown v7 for Markdown editing

## Boot Flow

Global services are registered in `src/main.tsx` in a fixed order:

1. `UIService`
2. `VaultService`
3. `GraphService`
4. `SearchService`
5. `PluginService`

`VaultService.initialize()` runs during startup to auto-open the last vault. Preserve this registration order unless there is a strong reason to redesign the bootstrap.

## Directory Map

Reach for the more specific guidance before adding local conventions here:

- `src/components/CLAUDE.md` - shared renderer components
- `src/pages/CLAUDE.md` - page-level structure, page services, local components
- `src/services/CLAUDE.md` - app-wide singleton services and RSJS usage
- `src/ipc/CLAUDE.md` - typed wrappers around `window.electronAPI`
- `src/styles/CLAUDE.md` - tokens, layout regions, and editor CSS placement
- `src/types/CLAUDE.md` - renderer-only types
- `src/utils/CLAUDE.md` - pure renderer utilities

## Boundaries

- Keep renderer code focused on UI, reactive state, and orchestration.
- File system access and native window behavior belong in `apps/client`.
- Shared contracts that cross renderer/main/core boundaries belong in `packages/dto`.
- Reusable domain logic should move downward into `packages/core` when it no longer needs renderer concerns.
