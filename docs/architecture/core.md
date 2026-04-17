# Core Package Architecture

## Overview

`packages/core` is a Node.js package containing all domain logic for aimo-note. It runs in the Electron main process and is accessed by the renderer via IPC. It has no UI or Electron-specific dependencies, making it testable and portable.

## Module Structure

```
packages/core/src/
├── index.ts           # Package entry point
├── vault/            # Vault operations
│   ├── index.ts      # Vault interface
│   ├── reader.ts     # Read .md files, parse frontmatter
│   └── writer.ts     # Write .md files
├── graph/            # Note connection graph
│   ├── index.ts      # Graph interface
│   └── extractor.ts  # Extract [[wiki-links]] and #tags
├── search/           # Full-text search
│   └── index.ts      # SearchIndex interface
└── plugins/          # Plugin system
    └── index.ts      # Plugin, PluginHooks, createPluginSystem
```

## Dependencies

```json
{
  "chokidar": "^3.6.0",      // File system watching
  "gray-matter": "^4.0.3",   // Frontmatter parsing
  "flexsearch": "^0.7.43"     // Full-text search index
}
```

## Vault Module

Manages the local file vault (folder of .md files).

### Interface

```typescript
export interface Vault {
  open(path: string): Promise<void>;
  close(): Promise<void>;
  readNote(path: string): Promise<Note>;
  writeNote(path: string, content: string): Promise<void>;
  deleteNote(path: string): Promise<void>;
  listNotes(): Promise<string[]>;
  watch(callback: (event: VaultEvent) => void): () => void;
}

export interface Note {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;  // content without frontmatter
}

export interface VaultEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
}
```

### Key Features

- **File I/O**: Async read/write using Node.js `fs/promises`
- **Frontmatter Parsing**: Uses `gray-matter` to parse YAML frontmatter
- **File Watching**: Uses `chokidar` to watch for external changes

## Graph Module

Builds and queries the note connection graph.

### Interface

```typescript
export interface Graph {
  buildFromNotes(notes: { path: string; body: string }[]): GraphData;
  getBacklinks(path: string): string[];
  getOutlinks(path: string): string[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  path: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}
```

### Link Extraction

Uses regex to extract:
- **Wiki Links**: `[[note-name]]`
- **Tags**: `#tag-name`

```typescript
// From extractor.ts
const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;
const TAG_REGEX = /#([a-zA-Z0-9_-]+)/g;
```

## Search Module

Full-text search using FlexSearch.

### Interface

```typescript
export interface SearchResult {
  path: string;
  score: number;
  matches: SearchMatch[];
}

export interface SearchMatch {
  field: string;
  indices: [number, number][];
  value: string;
}

export interface SearchIndex {
  add(path: string, content: string): void;
  remove(path: string): void;
  search(query: string, limit?: number): SearchResult[];
}
```

### Features

- **Incremental Indexing**: Add/remove documents without full reindex
- **Ranking**: Results scored by relevance
- **Content Search**: Searches note body content

## Plugin System

Lightweight plugin system with hooks.

### Interface

```typescript
export interface Plugin {
  name: string;
  version: string;
  onLoad?: () => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
  hooks?: PluginHooks;
}

export interface PluginHooks {
  onNoteCreate?: (path: string) => void | Promise<void>;
  onNoteUpdate?: (path: string) => void | Promise<void>;
  onNoteDelete?: (path: string) => void | Promise<void>;
  onSearch?: (query: string) => void | Promise<void>;
}

export interface PluginAPI {
  vault: {
    readNote: (path: string) => Promise<unknown>;
    writeNote: (path: string, content: string) => Promise<void>;
  };
}

export function createPluginSystem() {
  // Returns { loadPlugin, unloadPlugin, getPlugins }
}
```

### Plugin Lifecycle

1. **Load**: `pluginSystem.loadPlugin(plugin)` - calls `onLoad`
2. **Active**: Hooks called on relevant events
3. **Unload**: `pluginSystem.unloadPlugin(name)` - calls `onUnload`

## Testing Strategy

Core modules are pure Node.js, easily testable with Jest:

```typescript
// vault.test.ts
import { readNote } from './vault/reader';

test('parses frontmatter', async () => {
  const note = await readNote('/vault', 'test.md');
  expect(note.frontmatter).toHaveProperty('title');
});

// graph.test.ts
import { extractLinks } from './graph/extractor';

test('extracts wiki links', () => {
  const links = extractLinks('See [[Another Note]] for details');
  expect(links).toContain('Another Note');
});
```

## Extension Points

### Adding a New Vault Feature

1. Add method to `Vault` interface
2. Implement in `reader.ts` or `writer.ts`
3. Export from `vault/index.ts`

### Adding Graph Analysis

1. Add method to `Graph` interface
2. Implement in `builder.ts` (create if needed)
3. Export from `graph/index.ts`

### Adding Search Features

1. Extend `SearchIndex` interface
2. Implement new indexing logic in `indexer.ts` (create if needed)

### Adding Plugin Hooks

1. Add to `PluginHooks` interface
2. Call hook in appropriate places in `createPluginSystem`
