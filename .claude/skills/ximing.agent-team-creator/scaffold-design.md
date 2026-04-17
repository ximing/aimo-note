# aimo-note Scaffold Structure

## Directory Tree

```
aimo-note/
├── apps/
│   ├── render/                    # React frontend
│   │   └── src/
│   │       ├── main.tsx          # App entry point
│   │       ├── App.tsx           # Root component with routing
│   │       ├── index.css         # Global styles
│   │       │
│   │       ├── components/       # Reusable UI components
│   │       │   ├── ui/           # Base UI components (Button, Input, Modal...)
│   │       │   ├── editor/       # Markdown editor components
│   │       │   ├── graph/        # Graph visualization components
│   │       │   └── layout/       # Layout components (Sidebar, Header...)
│   │       │
│   │       ├── pages/           # Route pages
│   │       │   ├── home/         # Home / note list
│   │       │   ├── editor/       # Note editor page
│   │       │   ├── settings/     # Settings pages
│   │       │   ├── graph/        # Graph view page
│   │       │   └── search/       # Search page
│   │       │
│   │       ├── services/         # Frontend services (API calls, Electron IPC)
│   │       │   ├── vault.service.ts      # Vault operations via IPC
│   │       │   ├── graph.service.ts      # Graph data via IPC
│   │       │   └── search.service.ts      # Search via IPC
│   │       │
│   │       ├── stores/           # @rabjs/react reactive stores
│   │       │   ├── vault.store.ts         # Vault state (files, folders)
│   │       │   ├── editor.store.ts        # Editor state (current note, cursor)
│   │       │   ├── graph.store.ts         # Graph view state
│   │       │   └── search.store.ts        # Search state & results
│   │       │
│   │       ├── hooks/            # Custom React hooks
│   │       │   ├── useVault.ts           # Vault operations hook
│   │       │   ├── useNote.ts           # Note CRUD hook
│   │       │   ├── useGraph.ts          # Graph data hook
│   │       │   └── useSearch.ts         # Search hook
│   │       │
│   │       ├── utils/             # Utility functions
│   │       │   ├── markdown.ts    # Markdown parsing/rendering
│   │       │   ├── date.ts        # Date formatting
│   │       │   └── path.ts        # Path utilities
│   │       │
│   │       ├── types/             # TypeScript types (UI-specific)
│   │       │   └── index.ts
│   │       │
│   │       └── electron/          # Electron-specific code
│   │           └── isElectron.ts
│   │
│   └── client/                    # Electron desktop shell
│       └── src/
│           ├── main/
│           │   ├── index.ts       # Main process entry
│           │   ├── window-manager.ts
│           │   ├── menu-manager.ts
│           │   ├── tray-manager.ts
│           │   ├── shortcut-manager.ts
│           │   ├── ipc-handlers.ts
│           │   └── updater.ts
│           │
│           └── preload/
│               └── index.ts       # Preload script (IPC bridge)
│
├── packages/
│   ├── dto/                       # Data Transfer Objects (keep existing)
│   ├── logger/                    # Logger (keep existing)
│   │
│   └── core/                      # NEW: Core vault/graph/search logic (Node.js)
│       ├── src/
│       │   ├── index.ts           # Package entry point
│       │   │
│       │   ├── vault/            # Local file vault operations
│       │   │   ├── index.ts       # Vault service interface
│       │   │   ├── reader.ts      # Read .md files, parse frontmatter
│       │   │   ├── writer.ts       # Write .md files
│       │   │   ├── watcher.ts      # File system watcher (chokidar)
│       │   │   └── parser.ts       # Markdown + frontmatter parser
│       │   │
│       │   ├── graph/             # Note connection graph
│       │   │   ├── index.ts        # Graph service interface
│       │   │   ├── extractor.ts    # Extract links from markdown
│       │   │   ├── builder.ts      # Build graph from files
│       │   │   └── query.ts        # Graph queries (backlinks, etc.)
│       │   │
│       │   ├── search/            # Full-text search
│       │   │   ├── index.ts        # Search service interface
│       │   │   ├── indexer.ts      # Build search index
│       │   │   └── query.ts        # Search query execution
│       │   │
│       │   ├── plugins/           # Plugin system
│       │   │   ├── index.ts        # Plugin system interface
│       │   │   ├── loader.ts       # Plugin loader
│       │   │   └── api.ts          # Plugin API (hooks, events)
│       │   │
│       │   └── utils/             # Core utilities
│       │       ├── path.ts         # Path utilities
│       │       └── fs.ts          # File system utilities
│       │
│       ├── package.json
│       └── tsconfig.json
│
├── config/                        # Shared configs (keep existing)
├── scripts/                       # Build/deploy scripts (keep existing)
├── package.json                   # Root package.json
├── pnpm-workspace.yaml            # pnpm workspace config
└── turbo.json                    # Turborepo config
```

## Key Files to Create

### packages/core/ (NEW - Node.js core logic)
| File | Purpose |
|------|---------|
| `packages/core/src/vault/index.ts` | Vault service interface - open vault, read/write notes |
| `packages/core/src/vault/reader.ts` | Read markdown files, parse frontmatter |
| `packages/core/src/vault/writer.ts` | Write markdown files with frontmatter |
| `packages/core/src/vault/watcher.ts` | File system watcher for vault changes |
| `packages/core/src/graph/index.ts` | Graph service interface - note connections |
| `packages/core/src/graph/extractor.ts` | Extract [[wiki-links]] and #tags from markdown |
| `packages/core/src/graph/builder.ts` | Build graph data structure from vault |
| `packages/core/src/search/index.ts` | Search service interface |
| `packages/core/src/search/indexer.ts` | Build/search index (flexsearch or similar) |
| `packages/core/src/plugins/index.ts` | Plugin system - load/unload plugins |
| `packages/core/src/plugins/api.ts` | Plugin API exposed to plugins |
| `packages/core/package.json` | Package manifest with dependencies |
| `packages/core/tsconfig.json` | TypeScript config for core package |

### apps/render/src/ (Frontend refactor targets)
| File | Purpose |
|------|---------|
| `apps/render/src/services/vault.service.ts` | IPC wrapper for vault operations |
| `apps/render/src/services/graph.service.ts` | IPC wrapper for graph operations |
| `apps/render/src/services/search.service.ts` | IPC wrapper for search |
| `apps/render/src/stores/vault.store.ts` | Vault state (files tree, current vault) |
| `apps/render/src/stores/editor.store.ts` | Editor state (active note, dirty flag) |
| `apps/render/src/stores/graph.store.ts` | Graph view state |
| `apps/render/src/hooks/useVault.ts` | Hook for vault operations |
| `apps/render/src/hooks/useNote.ts` | Hook for note CRUD |
| `apps/render/src/pages/editor/` | New dedicated editor page |
| `apps/render/src/pages/graph/` | New dedicated graph page |
| `apps/render/src/components/editor/` | Editor-specific components |
| `apps/render/src/components/ui/` | Base UI components |

### apps/client/src/preload/ (IPC bridge)
| File | Purpose |
|------|---------|
| `apps/client/src/preload/index.ts` | Expose core services via contextBridge |

## Notes

### Design Decisions

1. **Core vs Render separation**: The `packages/core` package runs in Node.js (Electron main process) and handles all file I/O, graph building, and search indexing. The React frontend communicates with core via IPC.

2. **Why IPC for vault operations**: The vault involves file system operations that cannot safely run in the renderer process. All vault operations go through IPC handlers in the main process.

3. **Plugin system**: Plugins are loaded into the main process and can hook into vault operations, graph building, and search indexing. They receive a defined API for interacting with the core.

4. **@rabjs/react stores**: Used for reactive state in the frontend. Stores mirror the state of core services and update via IPC events.

5. **Graph data flow**: Vault watcher detects file changes -> notifies core -> core rebuilds graph -> emits event -> frontend store updates -> UI re-renders.

6. **Search indexing**: Search index is built incrementally as files change. Search queries go through IPC to the main process where the index lives.

### Migration Path

The existing codebase has many files that will be refactored or removed. The stub files above represent the minimal new structure needed. Existing files can be:
- **Kept**: API services, existing components (will be refactored later)
- **Removed**: Old memo-centric services after vault service takes over
- **New**: editor/, graph/, search/ pages and vault/graph/search services

### Dependencies for packages/core

```json
{
  "dependencies": {
    "chokidar": "^3.6.0",
    "gray-matter": "^4.0.3",
    "flexsearch": "^0.7.43"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```
