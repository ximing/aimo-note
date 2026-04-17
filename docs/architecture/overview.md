# AIMO-Note Architecture Overview

## Project Structure

```
aimo-note/
├── apps/
│   ├── render/          # React frontend (runs in Electron renderer)
│   │   └── src/
│   │       ├── components/   # UI layer (ui/, editor/, graph/, layout/, explorer/, common/)
│   │       ├── pages/        # Route pages (home, editor, graph, search, settings)
│   │       ├── services/       # @rabjs/react state management
│   │       ├── ipc/     # IPC communication layer
│   │       ├── types/        # TypeScript types
│   │       └── utils/        # Utilities
│   │
│   └── client/          # Electron main process (native shell)
│       └── src/
│           ├── main/        # Main process modules
│           └── preload/     # Preload scripts (IPC bridge)
│
├── packages/
│   ├── core/            # Domain logic (runs in main process)
│   │   └── src/
│   │       ├── vault/    # File vault operations
│   │       ├── graph/    # Note connection graph
│   │       ├── search/   # Full-text search
│   │       └── plugins/  # Plugin system
│   │
│   ├── dto/             # Shared TypeScript types
│   └── logger/         # Logging utilities
│
├── docs/
│   └── architecture/   # Architecture documentation
│
├── config/              # ESLint, TypeScript, Rollup configs
└── turbo.json           # Turborepo config
```

## Architecture Layers

### 1. Presentation Layer (apps/render)
React 19 SPA running in Electron renderer. Responsible for UI rendering and user interactions.

- **Components**: Pure UI components, organized by domain (editor, graph, layout)
- **Pages**: Route-level components composing business features
- **Services**: Reactive state via @rabjs/react
- **IPC**: Typed wrappers around IPC calls

### 2. Native Integration Layer (apps/client)
Electron main process handling OS integration.

- **Window Management**: BrowserWindow lifecycle, state persistence
- **Menu/Tray**: Application menu and system tray
- **IPC Handlers**: Bridges renderer requests to core services
- **Auto-Updater**: App update lifecycle

### 3. Domain Logic Layer (packages/core)
Pure Node.js logic running in main process.

- **Vault**: Read/write .md files, frontmatter parsing, file watching
- **Graph**: Extract [[wiki-links]], build connection graph
- **Search**: Full-text search with flexsearch index
- **Plugins**: Plugin loading and hook system

### 4. Shared Types (packages/dto)
TypeScript interfaces shared across all layers.

### 5. Infrastructure (packages/logger)
Logging utilities for the entire application.

## Data Flow

```
User Interaction
      ↓
React Components (apps/render)
      ↓
IPC (invoke)
      ↓
IPC Handlers (apps/client)
      ↓
Core Services (packages/core)
      ↓
File System
```

## Key Design Principles

### Local-First
All data stored locally in vault folders. No cloud dependency.

### IPC-Based Communication
Renderer never accesses file system directly. All operations via typed IPC channels.

### Separation of Concerns
- Render: UI only
- Client: OS integration only
- Core: Business logic only

### Plugin Extensibility
Core package provides plugin system with hooks for note lifecycle events.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, Tailwind CSS, React Router |
| State | @rabjs/react |
| Desktop | Electron |
| Domain Logic | Node.js |
| Search | FlexSearch |
| Vault Parsing | Gray-Matter |
| File Watching | Chokidar |
| Monorepo | pnpm workspaces, Turborepo |
| Types | TypeScript |

## IPC Channel Convention

All channels follow `domain:action` pattern:

| Domain | Channels |
|--------|----------|
| Vault | `vault:open`, `vault:read`, `vault:write`, `vault:delete`, `vault:list` |
| Graph | `graph:build`, `graph:getBacklinks`, `graph:getOutlinks` |
| Search | `search:query`, `search:reindex` |
| Plugin | `plugin:load`, `plugin:unload`, `plugin:list` |
| Window | `window:minimize`, `window:maximize`, `window:close` |
| FS | `fs:selectVault` |

## Getting Started

```bash
# Install dependencies
pnpm install

# Run in development
pnpm dev

# Build for production
pnpm build

# Type check
pnpm typecheck
```

## Architecture Documentation

- [Render App Architecture](./render.md) - React frontend details
- [Client App Architecture](./client.md) - Electron main process details
- [Core Package Architecture](./core.md) - Domain logic details
