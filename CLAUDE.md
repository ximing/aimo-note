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

## Progressive Guidance Map

Use the most specific guidance available for the area you are editing:

- `apps/render/CLAUDE.md` - renderer boot flow, shell-level UI orchestration, and directory map
- `apps/client/CLAUDE.md` - Electron main process responsibilities and IPC boundary
- `packages/core/CLAUDE.md` - pure domain logic conventions
- `packages/dto/CLAUDE.md` - shared contract rules
- `packages/logger/CLAUDE.md` - logging package notes
- `apps/render/src/components/CLAUDE.md` - shared renderer components
- `apps/render/src/pages/CLAUDE.md` - page-level fractal structure and page services
- `apps/render/src/services/CLAUDE.md` - global renderer services and RSJS patterns
- `apps/render/src/ipc/CLAUDE.md` - typed renderer IPC wrappers
- `apps/render/src/styles/CLAUDE.md` - tokens, layout, and editor style architecture
- `apps/render/src/types/CLAUDE.md` - renderer-only types
- `apps/render/src/utils/CLAUDE.md` - renderer utility helpers
- `.claude/rules/*.md` - path-scoped rules for selective, cross-cutting guidance

## Working Style For This Repo

- Check for more specific `CLAUDE.md` files in subdirectories before making local changes.
- Prefer minimal, architecture-aligned edits over broad rewrites.
- Keep renderer code focused on UI + orchestration; move reusable domain logic downward into `packages/core` when appropriate.
- When changing layout or styling, inspect the renderer style architecture and relevant layout docs.
- When changing Electron window behavior, inspect both `apps/client/src/main/index.ts` and `apps/client/src/main/window/manager.ts`.

## Documentation

- `docs/architecture/overview.md`
- `docs/architecture/client.md`
- `docs/architecture/core.md`
- `docs/architecture/layout.md`
- `docs/superpowers/specs/2026-04-19-titlebar-layout-design.md`
- `.claude/skills/rabjs.reactive-state-react/SKILL.md`
