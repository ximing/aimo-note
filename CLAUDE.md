# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AIMO-Note

Local-first Obsidian-like note-taking app built with Electron + React.

## Project Structure

```
aimo-note/
├── apps/
│   ├── render/          # React frontend (SPA in Electron renderer)
│   └── client/         # Electron main process (native shell)
├── packages/
│   ├── core/           # Domain logic (vault, graph, search, plugins) - pure Node.js
│   ├── dto/            # Shared TypeScript types
│   └── logger/         # Logging utilities
├── config/             # ESLint, TypeScript, Rollup configs
├── docs/architecture/  # Architecture documentation
└── turbo.json          # Turborepo config
```

## Common Commands

```bash
# Install dependencies
pnpm install

# Run development (all packages)
pnpm dev

# Run frontend only
pnpm --filter @aimo-note/render dev

# Run Electron app only
pnpm --filter @aimo-note/client dev

# Build for production
pnpm build

# Build frontend only
pnpm --filter @aimo-note/render build

# Build Electron app
pnpm --filter @aimo-note/client build

# Package as distributable
pnpm --filter @aimo-note/client dist:mac    # macOS
pnpm --filter @aimo-note/client dist:win    # Windows
pnpm --filter @aimo-note/client dist:linux # Linux

# Lint all packages
pnpm lint

# Format code
pnpm format
```

## Architecture

### Layer Separation

1. **apps/render** - React 19 SPA running in Electron renderer
   - Components, pages, hooks, services
   - Uses @rabjs/react for reactive state management
   - IPC wrappers for main process communication

2. **apps/client** - Electron main process
   - Window/menu/tray management
   - IPC handlers bridging renderer to core
   - Auto-updater integration

3. **packages/core** - Pure Node.js domain logic (no Electron deps)
   - Vault: Read/write .md files, frontmatter parsing with gray-matter
   - Graph: Extract [[wiki-links]] and #tags, build connection graph
   - Search: Full-text search with FlexSearch
   - Plugins: Hook-based plugin system

4. **packages/dto** - TypeScript interfaces shared across all layers

### IPC Communication

Renderer never accesses file system directly. All operations go through typed IPC channels:

```
vault:open, vault:getNote, vault:getAllNotes, vault:createNote, vault:updateNote, vault:deleteNote
graph:getGraph, graph:getBacklinks, graph:getOutlinks
search:search, search:searchTitle, search:reindex
```

### State Management

Uses @rabjs/react for reactive state in renderer. Key patterns:
- Service classes extend `Service` base class
- Components wrapped with `observer()` for reactivity
- Use `useService()` hook to access services
- Async methods automatically track loading/error states

See skill: `.claude/skills/km.rs-react/SKILL.md`

## Naming Conventions

### File Names
- **Kebab-case**: `use-file-system.ts`, `vault-service.ts`, `milkdown-editor.tsx`
- **Hook files**: `use-` prefix + kebab-case, e.g., `use-vault.ts`
- **Service files**: `.service.ts` suffix, e.g., `vault.service.ts`

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite 7, Tailwind CSS 3.4, React Router 7 |
| Editor | Milkdown v7 (WYSIWYG markdown) |
| State | @rabjs/react |
| Desktop | Electron 40 |
| Core | Node.js, Chokidar, Gray-Matter, FlexSearch |
| Monorepo | pnpm workspaces, Turborepo |

## Key Design Principles

- **Local-first**: All data stored locally in vault folders
- **IPC-based**: Renderer accesses core only through IPC
- **Separation**: Render=UI, Client=OS integration, Core=business logic
- **Plugin extensibility**: Core provides hooks for note lifecycle events

## Testing

Tests exist only in `packages/logger/src/__tests__/`. Core and render packages do not yet have tests.

## Documentation

- [Architecture Overview](./docs/architecture/overview.md)
- [Render Architecture](./docs/architecture/render.md)
- [Milkdown Editor](./docs/architecture/milkdown.md)
- [Client Architecture](./docs/architecture/client.md)
- [Core Architecture](./docs/architecture/core.md)
- [@rabjs/react Skill](./.claude/skills/km.rs-react/SKILL.md)
