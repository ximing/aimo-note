# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AIMO-Note

Local-first Obsidian-like note-taking app built with Electron + React.

## Project Structure

```
aimo-note/
├── apps/
│   ├── render/          # React 19 SPA (Electron renderer)
│   └── client/         # Electron main process
├── packages/
│   ├── core/           # Domain logic - vault, graph, search, plugins (pure Node.js)
│   ├── dto/            # Shared TypeScript types
│   └── logger/         # Logging utilities
├── config/             # ESLint, TypeScript, Rollup configs
├── docs/architecture/  # Architecture documentation
└── turbo.json          # Turborepo config
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

1. **apps/render** - React 19 SPA running in Electron renderer
2. **apps/client** - Electron main process (native shell)
3. **packages/core** - Pure Node.js domain logic (no Electron deps)
4. **packages/dto** - TypeScript interfaces shared across all layers

### State Management

Uses @rabjs/react for reactive state in renderer. See `apps/render/src/services/CLAUDE.md`.

### IPC Communication

Renderer never accesses file system directly. All operations go through typed IPC channels. See `apps/render/src/ipc/CLAUDE.md`.

## Documentation

- [Architecture Overview](./docs/architecture/overview.md)
- [Client Architecture](./docs/architecture/client.md)
- [Core Architecture](./docs/architecture/core.md)
- [@rabjs/react Skill](./.claude/skills/rabjs.rs-react/SKILL.md)

## Sub-directory Guidance

| Directory | Guidance |
|-----------|----------|
| `apps/client/` | Electron main process, window/menu/tray/IPC handlers |
| `apps/render/` | React SPA entry, global patterns |
| `apps/render/src/components/` | Cross-page reusable components |
| `apps/render/src/pages/` | Page-level patterns, page service usage |
| `apps/render/src/services/` | Global service registration and usage |
| `apps/render/src/ipc/` | IPC client-side wrappers |
| `packages/core/` | Vault, graph, search, plugins modules |
| `packages/dto/` | Shared types |
| `packages/logger/` | Logging utilities |

## Layout Structure

The app uses a nested layout with the following hierarchy:

```
app-layout (root)
├── main-area (flex row)
│   ├── left-rail (48px, icon navigation)
│   ├── left-sidebar (w-64)
│   │   ├── left-sidebar-header (pl-12 for macOS traffic lights, Search + collapse buttons)
│   │   └── left-sidebar-content (VaultTree)
│   └── main-content (flex col: EditorTabs + editor-container + StatusBar)
└── StatusBar (bottom, word/character count)
```

### CSS Class Naming Convention

| Old (deprecated) | New |
|------------------|-----|
| `.explorer` | `.left-sidebar` |
| `.explorer-header` | `.left-sidebar-header` |
| `.explorer-content` | `.left-sidebar-content` |

EditorTabs live inside `main-content`, not in the title bar.
