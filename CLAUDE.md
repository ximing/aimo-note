# AIMO-Note

Local-first Obsidian-like note-taking app built with Electron + React.

## Project Structure

```
aimo-note/
├── apps/
│   ├── render/          # React frontend (SPA in Electron renderer)
│   └── client/          # Electron main process (native shell)
├── packages/
│   ├── core/            # Domain logic (vault, graph, search, plugins)
│   ├── dto/             # Shared TypeScript types
│   └── logger/          # Logging utilities
├── docs/architecture/   # Architecture documentation
└── config/              # ESLint, TypeScript, Rollup configs
```

## Key Concepts

- **Vault**: Local folder containing .md note files
- **IPC**: Typed channels for renderer ↔ main communication
- **@rabjs/react**: Reactive state management in renderer
- **packages/core**: Pure Node.js domain logic (no Electron deps)
- **Plugin System**: Extensible via hooks (onNoteCreate, onNoteUpdate, etc.)

## Common Tasks

```bash
# Install dependencies
pnpm install

# Run development
pnpm dev

# Build for production
pnpm build

# Type check all packages
pnpm typecheck
```

## Architecture

- **Render**: React components, services, ipc, hooks
- **Client**: Window/menu/tray management, IPC handlers
- **Core**: Vault I/O, graph building, search indexing, plugins

## Naming Conventions

### File Names
- **Kebab-case**: 使用小写字母 + 连字符（kebab-case）
  - ✅ `use-file-system.ts`, `vault-service.ts`, `milkdown-editor.tsx`
  - ❌ `useFileSystem.ts`, `vaultService.ts`, `MilkdownEditor.tsx`
- **组件文件**: 使用 kebab-case，如 `editor-toolbar.tsx`
- **Hook 文件**: 使用 `use-` 前缀 + kebab-case，如 `use-vault.ts`
- **Service 文件**: 使用 `.service.ts` 后缀，如 `vault.service.ts`

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, Tailwind CSS, React Router |
| Editor | Milkdown v7 (WYSIWYG markdown) |
| State | @rabjs/react |
| Desktop | Electron |
| Core | Node.js, Chokidar, Gray-Matter, FlexSearch |
| Monorepo | pnpm workspaces, Turborepo |

## Documentation

- [Architecture Overview](./docs/architecture/overview.md)
- [Render Architecture](./docs/architecture/render.md)
- [Milkdown Editor](./docs/architecture/milkdown.md)
- [Client Architecture](./docs/architecture/client.md)
- [Core Architecture](./docs/architecture/core.md)
