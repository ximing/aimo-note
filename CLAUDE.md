# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

# AIMO-Note

Local-first Obsidian-like note-taking app built with Electron + React.

## Project Structure

```text
aimo-note/
├── apps/
│   ├── render/          # React 19 SPA (Electron renderer)
│   └── client/          # Electron main process
├── packages/
│   ├── core/            # Domain logic - vault, graph, search, plugins (pure Node.js)
│   ├── dto/             # Shared TypeScript types
│   └── logger/          # Logging utilities
├── config/              # ESLint, TypeScript, Rollup configs
├── docs/architecture/   # Architecture documentation
└── turbo.json           # Turborepo config
```

## Common Commands

```bash
pnpm install
pnpm dev
pnpm --filter @aimo-note/render dev
pnpm --filter @aimo-note/client dev
pnpm build
pnpm lint
pnpm format
```

## Architecture

### Layer Separation

1. **`apps/render`** - React SPA running in Electron renderer
2. **`apps/client`** - Electron main process (window, menu, tray, native shell)
3. **`packages/core`** - Pure Node.js domain logic; do not add Electron dependencies here
4. **`packages/dto`** - Shared TypeScript types across layers

### Hard Boundaries

- Renderer never accesses the file system directly.
- File system, native window behavior, and Electron APIs belong in `apps/client`.
- Shared domain logic belongs in `packages/core` and should stay framework-agnostic.
- Cross-layer contracts should live in `packages/dto`.

### State Management

Renderer state uses `@rabjs/react` services and DI. See `apps/render/src/services/CLAUDE.md`.

### IPC Communication

Renderer-to-main communication must go through typed IPC wrappers. See `apps/render/src/ipc/CLAUDE.md`.

## Renderer Boot Flow

The current renderer entry is `apps/render/src/main.tsx`.

- `./index.css` loads Tailwind base/components/utilities only.
- `./styles/index.css` loads the app's custom style architecture.
- `@rabjs/react` services are registered in a fixed order:
  - `UIService`
  - `VaultService`
  - `GraphService`
  - `SearchService`
  - `PluginService`
- `VaultService.initialize()` is triggered during startup to auto-open the last vault.

When changing app bootstrap behavior, preserve service registration order unless there is a strong reason to redesign it.

## Styling System

Renderer styles are split by concern under `apps/render/src/styles/`.

| File | Purpose |
|------|---------|
| `variables.css` | Design tokens / CSS custom properties |
| `base.css` | Global reset-like rules, scrollbar, transitions |
| `layout.css` | App shell layout classes |
| `components.css` | Reusable UI component styles |
| `editor-layout.css` | Editor wrapper layout |
| `editor-content.css` | Typography and editor content styles |
| `editor-syntax.css` | Syntax highlighting |

### Style Placement Rules

- Add new tokens to `variables.css`.
- Add app shell / region layout rules to `layout.css`.
- Add shared component rules to `components.css`.
- Add editor-only rules to the appropriate `editor-*.css` file.
- Prefer extending the current CSS architecture instead of putting more global styles into `apps/render/src/index.css`.

### Current Import Order

In `apps/render/src/styles/index.css`, keep the imports ordered as:

```css
@import './variables.css';
@import './base.css';
@import './layout.css';
@import './components.css';
@import './editor-layout.css';
@import './editor-content.css';
@import './editor-syntax.css';
```

## Layout Conventions

The app uses a nested layout with the following hierarchy:

```text
app-layout (root)
├── main-area (flex row)
│   ├── left-column (flex col)
│   │   ├── header-row
│   │   └── content-area
│   │       ├── left-rail (48px)
│   │       └── left-sidebar
│   ├── right-column (flex col)
│   │   ├── EditorTabs
│   │   └── main-content
│   └── SidePanel
└── StatusBar
```

### Titlebar / Sidebar Rules

- On macOS the app uses `titleBarStyle: 'hidden'`.
- Native traffic lights are not in the DOM; `header-row` must leave space for them.
- `header-row` and the traffic-light area visually share the same row.
- `left-rail` remains a fixed 48px navigation strip below the traffic lights.
- `EditorTabs` live in `right-column`, not in the title bar.
- Left sidebar width is resizable and persisted through UI settings.

### Layout Naming Convention

| Old (deprecated) | New |
|------------------|-----|
| `.explorer` | `.left-sidebar` |
| `.explorer-header` | `.left-sidebar-header` |
| `.explorer-content` | `.left-sidebar-content` |

Prefer the new names for all new code and refactors.

## Sub-directory Guidance

| Directory | Guidance |
|-----------|----------|
| `apps/client/` | Electron main process, window/menu/tray/IPC handlers |
| `apps/render/` | React SPA entry, global patterns, page shell |
| `apps/render/src/components/` | Cross-page reusable components |
| `apps/render/src/pages/` | Page-level patterns and service usage |
| `apps/render/src/services/` | Global service registration and reactive state |
| `apps/render/src/ipc/` | Renderer-side typed IPC wrappers |
| `apps/render/src/styles/` | Global style architecture by concern |
| `packages/core/` | Vault, graph, search, plugin modules |
| `packages/dto/` | Shared types and contracts |
| `packages/logger/` | Logging utilities |

## Working Style For This Repo

- Check for more specific `CLAUDE.md` files in subdirectories before making local changes.
- Prefer minimal, architecture-aligned edits over broad rewrites.
- Keep renderer code focused on UI + orchestration; move reusable domain logic downward into `packages/core` when appropriate.
- When changing layout or styling, verify the change still matches the current shell structure and naming conventions.
- When changing Electron window behavior, inspect both `apps/client/src/main/index.ts` and `apps/client/src/main/window/manager.ts`.

## Documentation

- `docs/architecture/overview.md`
- `docs/architecture/client.md`
- `docs/architecture/core.md`
- `docs/architecture/layout.md`
- `docs/superpowers/specs/2026-04-19-titlebar-layout-design.md`
- `.claude/skills/rabjs.reactive-state-react/SKILL.md`
