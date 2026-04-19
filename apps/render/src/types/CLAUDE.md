# types/ - TypeScript Type Definitions

Shared TypeScript interfaces for the renderer process.

## File Structure

| File | Purpose |
|------|---------|
| `index.ts` | Re-exports all types |
| `note.ts` | Note and note metadata types |
| `vault.ts` | Vault info and file tree types |
| `graph.ts` | Knowledge graph node/edge types |
| `plugin.ts` | Plugin system and API types |
| `editor.ts` | Editor position and mode types |

## Core Types

### Note (note.ts)

```typescript
interface Note {
  path: string;
  content: string;
  metadata: NoteMetadata;
}

interface NoteMetadata {
  path: string;
  title: string;
  created: Date;
  modified: Date;
  tags: string[];
  links: string[];
  backlinks: string[];
}
```

### Vault (vault.ts)

```typescript
interface VaultInfo {
  path: string;
  name: string;
  files: number;
  size: number;
}

interface VaultFile {
  path: string;
  name: string;
  isDirectory: boolean;
  children?: VaultFile[];  // Recursive tree structure
}
```

### Graph (graph.ts)

```typescript
interface GraphNode {
  id: string;
  label: string;
  type: 'file' | 'folder' | 'tag';
  path?: string;
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'link' | '引用';
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

### Plugin (plugin.ts)

```typescript
interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  main: string;
  enabled: boolean;
}

interface PluginAPI {
  app: AppAPI;
  note: NoteAPI;
  workspace: WorkspaceAPI;
}

interface PluginManifest {
  id: string;
  name: string;
  version: string;
  main: string;
  permissions?: string[];
}
```

### Editor (editor.ts)

```typescript
interface Position {
  line: number;
  column: number;
}

interface Selection {
  start: Position;
  end: Position;
}

interface EditorMode {
  type: 'edit' | 'preview' | 'split';
}
```

## Usage

Import from the barrel file:

```typescript
import { Note, VaultInfo, GraphData } from '@/types';
```

## Relationship with packages/dto

These types are **renderer-specific**. For types shared across layers (renderer, client, core), define them in `packages/dto/`.

## Adding New Types

1. Create new file in `types/` directory
2. Export interfaces/types
3. Add re-export to `index.ts`
