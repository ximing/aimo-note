# Render App Architecture

## Overview

The render app is the frontend UI layer of aimo-note, a local-first Obsidian-like note-taking application. Built with React 19, Vite, Tailwind CSS, and React Router, it communicates with the Electron main process via IPC. The architecture emphasizes separation of concerns, testability, and extensibility for long-term iteration.

## Directory Structure

```
apps/render/src/
├── components/              # UI Layer
│   ├── ui/                  # Base UI primitives (Button, Input, Modal, Dropdown, etc.)
│   ├── editor/              # Markdown editor components
│   ├── graph/               # Graph visualization components
│   ├── layout/              # App layout components (Sidebar, TitleBar, StatusBar)
│   ├── explorer/            # File explorer / vault tree
│   └── common/              # Shared components (CommandPalette, ContextMenu)
├── pages/                   # Route Pages
│   ├── home/
│   ├── editor/
│   ├── graph/
│   ├── search/
│   └── settings/
├── stores/                  # @rabjs/react State Management
│   ├── vault.store.ts       # Vault state (files, folders, vault path)
│   ├── editor.store.ts      # Editor state (current note, cursor, selection)
│   ├── graph.store.ts       # Graph data and view state
│   ├── search.store.ts      # Search query and results
│   ├── ui.store.ts          # UI state (sidebar, theme, modals)
│   └── plugin.store.ts      # Plugin registry state
├── ipc/                     # IPC Communication Layer (Typed IPC wrappers)
│   ├── vault.ts           # IPC: read/write/list notes
│   ├── graph.ts           # IPC: get graph data
│   ├── search.ts          # IPC: search notes
│   ├── plugin.ts          # IPC: load/unload plugins
│   ├── fs.ts              # IPC: file system operations (select vault)
│   └── window.ts          # IPC: window controls
├── hooks/                   # Custom React Hooks
│   ├── useVault.ts          # Vault operations
│   ├── useNote.ts           # Note CRUD
│   ├── useGraph.ts          # Graph data
│   ├── useSearch.ts         # Search functionality
│   ├── useEditor.ts         # Editor operations
│   ├── usePlugins.ts        # Plugin management
│   ├── useFileSystem.ts     # FS access
│   └── useKeyboardShortcuts.ts
├── types/                   # TypeScript Types
│   ├── note.ts              # Note, NoteMetadata types
│   ├── vault.ts             # Vault types
│   ├── graph.ts             # Graph types
│   ├── plugin.ts            # Plugin API types
│   └── editor.ts            # Editor types
├── utils/                   # Utilities
│   ├── markdown.ts          # Markdown parsing, link extraction
│   ├── path.ts              # Path utilities
│   ├── date.ts              # Date formatting
│   ├── debounce.ts          # Debounce/throttle
│   └── classNames.ts        # Class name helper
├── App.tsx                  # Root component with routing
└── main.tsx                 # Entry point
```

## Module Responsibilities

### components/ui/

Base UI primitives that are framework-agnostic and highly reusable.

**Responsibilities:**
- Provide fundamental UI building blocks (Button, Input, Modal, Dropdown, Select, Tabs, etc.)
-封装 Tailwind CSS 样式和交互状态
- Maintain consistent design language across the app

**Public API:**
```typescript
// Example exports
export { Button } from './Button';
export { Input } from './Input';
export { Modal } from './Modal';
export { Dropdown } from './Dropdown';
export type { ButtonProps } from './Button';
```

### components/editor/

Milkdown v7 WYSIWYG markdown editor components.

**Tech Stack:**
- `@milkdown/react` - React integration
- `@milkdown/kit/core` - Core editor
- `@milkdown/kit/preset/commonmark` - CommonMark support
- `@milkdown/kit/plugin/history` - Undo/redo
- `@milkdown/kit/plugin/listener` - Event listener
- `@milkdown/kit/plugin/clipboard` - Clipboard support
- `@milkdown/kit/plugin/upload` - File upload
- `@milkdown/kit/plugin/indent` - List indentation

**Responsibilities:**
- `MilkdownEditor.tsx` - Core editor wrapper with MilkdownProvider
- `EditorToolbar.tsx` - Formatting toolbar (bold, italic, headings, etc.)
- `SuggestionPopup.tsx` - Autocomplete for `[[wiki-links]]` and `#tags`
- `SlashCommand.tsx` - Slash command menu
- `EditorStatus.tsx` - Word count, cursor position

**Public API:**
```typescript
export { MilkdownEditor } from './MilkdownEditor';
export { EditorToolbar } from './EditorToolbar';
export { SuggestionPopup } from './SuggestionPopup';
export { SlashCommand } from './SlashCommand';
export { EditorStatus } from './EditorStatus';
```

**MilkdownEditor Usage:**
```tsx
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { getMarkdown } from '@milkdown/kit/utils';

function MilkdownEditor({ onChange, defaultValue }: { onChange?: (md: string) => void; defaultValue?: string }) {
  const { loading, get } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, defaultValue || '# New Note');
        if (onChange) {
          ctx.get(listenerCtx).markdownUpdated((ctx, markdown) => {
            onChange(markdown);
          });
        }
      })
      .use(commonmark)
      .use(history)
      .use(listener);
  }, [onChange, defaultValue]);

  return (
    <div className="milkdown-editor">
      {loading && <div>Loading...</div>}
      <Milkdown />
    </div>
  );
}
```

**Wiki-link and Tag Support:**
Custom plugins extend Milkdown for `[[note-link]]` and `#tag` syntax:
- `useWikiLinkPlugin()` - Creates `[[link]]` from typing `[[`
- `useTagPlugin()` - Creates `#tag` from typing `#`

### components/graph/

Graph visualization components using D3.js.

**Responsibilities:**
- `GraphView.tsx` - Main graph canvas with zoom/pan
- `GraphNode.tsx` - Individual node rendering
- `GraphControls.tsx` - Zoom, filter, layout controls

**Public API:**
```typescript
export { GraphView } from './GraphView';
export { GraphNode } from './GraphNode';
export { GraphControls } from './GraphControls';
```

### components/layout/

App-level layout components.

**Responsibilities:**
- `Sidebar.tsx` - Navigation sidebar with vault explorer
- `TitleBar.tsx` - Custom title bar for Electron (window controls)
- `StatusBar.tsx` - Bottom status bar (sync status, word count, etc.)

**Public API:**
```typescript
export { Sidebar } from './Sidebar';
export { TitleBar } from './TitleBar';
export { StatusBar } from './StatusBar';
```

### components/explorer/

File explorer and vault navigation components.

**Responsibilities:**
- `VaultTree.tsx` - Hierarchical file/folder tree
- `TreeNode.tsx` - Individual tree node (file or folder)
- `QuickSwitcher.tsx` - Command palette for quick file switching (Cmd+P)

**Public API:**
```typescript
export { VaultTree } from './VaultTree';
export { TreeNode } from './TreeNode';
export { QuickSwitcher } from './QuickSwitcher';
```

### components/common/

Shared components not fitting other categories.

**Responsibilities:**
- `CommandPalette.tsx` - Global command palette (actions, navigation)
- `ContextMenu.tsx` - Right-click context menus

**Public API:**
```typescript
export { CommandPalette } from './CommandPalette';
export { ContextMenu } from './ContextMenu';
```

### pages/

Route-level page components that compose components and connect to stores.

**Responsibilities:**
- `home/HomePage.tsx` - Vault overview, recent files, daily notes
- `editor/EditorPage.tsx` - Note editing (core page)
- `graph/GraphPage.tsx` - Full graph view
- `search/SearchPage.tsx` - Search interface with filters
- `settings/SettingsPage.tsx` - App settings

**Public API:**
Each page exports a default React component. Pages receive route parameters via React Router.

### stores/

@rabjs/react stores for reactive state management.

**Responsibilities:**

**vault.store.ts**
```typescript
interface VaultState {
  path: string | null;
  files: Map<string, NoteMetadata>;
  folders: string[];
  activeFile: string | null;
}
// Public API
export const vaultStore;
export function useVaultStore();
export function openVault(path: string): Promise<void>;
export function refreshVault(): Promise<void>;
```

**editor.store.ts**
```typescript
interface EditorState {
  currentNote: Note | null;
  content: string;
  cursor: { line: number; column: number };
  selection: { start: Position; end: Position } | null;
  isDirty: boolean;
}
// Public API
export const editorStore;
export function useEditorStore();
export function openNote(path: string): Promise<void>;
export function saveNote(): Promise<void>;
```

**graph.store.ts**
```typescript
interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  viewState: { zoom: number; pan: { x: number; y: number } };
  selectedNode: string | null;
}
// Public API
export const graphStore;
export function useGraphStore();
```

**search.store.ts**
```typescript
interface SearchState {
  query: string;
  results: SearchResult[];
  filters: SearchFilters;
  isSearching: boolean;
}
// Public API
export const searchStore;
export function useSearchStore();
export function search(query: string): Promise<void>;
```

**ui.store.ts**
```typescript
interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  activeModal: string | null;
  commandPaletteOpen: boolean;
}
// Public API
export const uiStore;
export function useUIStore();
```

**plugin.store.ts**
```typescript
interface PluginState {
  plugins: Map<string, Plugin>;
  enabledPlugins: Set<string>;
}
// Public API
export const pluginStore;
export function usePluginStore();
export function loadPlugin(id: string): Promise<void>;
export function unloadPlugin(id: string): Promise<void>;
```

### ipc/

IPC communication layer with Electron main process. Each module wraps typed IPC calls.

**Responsibilities:** Abstract IPC calls into modules. Each module handles a domain and provides typed methods.

**vault.ts**
```typescript
export interface Vault {
  open(path: string): Promise<VaultInfo>;
  readNote(path: string): Promise<Note>;
  writeNote(path: string, content: string): Promise<void>;
  listFiles(): Promise<string[]>;
  createFolder(path: string): Promise<void>;
  deleteNote(path: string): Promise<void>;
}

export const vault: Vault;
```

**graph.ts**
```typescript
export interface Graph {
  getGraphData(options?: GraphOptions): Promise<GraphData>;
  getBacklinks(path: string): Promise<string[]>;
}

export const graph: Graph;
```

**search.ts**
```typescript
export interface Search {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  searchInContent(query: string): Promise<SearchResult[]>;
}

export const search: Search;
```

**plugin.ts**
```typescript
export interface Plugin {
  loadPlugin(pluginPath: string): Promise<PluginManifest>;
  unloadPlugin(pluginId: string): Promise<void>;
  getPluginSettings(pluginId: string): Promise<Record<string, unknown>>;
  setPluginSettings(pluginId: string, settings: Record<string, unknown>): Promise<void>;
}

export const plugin: Plugin;
```

**fs.ts**
```typescript
export interface FS {
  selectVault(): Promise<string | null>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export const fs: FS;
```

**window.ts**
```typescript
export interface Window {
  minimize(): void;
  maximize(): void;
  close(): void;
  isMaximized(): Promise<boolean>;
  setAlwaysOnTop(flag: boolean): void;
}

export const window: Window;
```

### hooks/

Custom React hooks that encapsulate business logic and connect components to stores/ipc.

**useVault.ts**
```typescript
export function useVault(): {
  path: string | null;
  files: NoteMetadata[];
  openVault: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
};
```

**useNote.ts**
```typescript
export function useNote(path: string): {
  note: Note | null;
  content: string;
  updateContent: (content: string) => void;
  save: () => Promise<void>;
  isDirty: boolean;
};
```

**useEditor.ts**
```typescript
export function useEditor(): {
  openNote: (path: string) => void;
  saveCurrentNote: () => Promise<void>;
  cursor: Position;
  selection: Selection | null;
  insertText: (text: string) => void;
};
```

**useGraph.ts**
```typescript
export function useGraph(): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: string | null;
  setSelectedNode: (id: string | null) => void;
  refresh: () => Promise<void>;
};
```

**useSearch.ts**
```typescript
export function useSearch(): {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  search: (q: string) => Promise<void>;
  clearSearch: () => void;
};
```

**usePlugins.ts**
```typescript
export function usePlugins(): {
  plugins: Plugin[];
  enabledPlugins: string[];
  loadPlugin: (id: string) => Promise<void>;
  unloadPlugin: (id: string) => Promise<void>;
  togglePlugin: (id: string) => void;
};
```

**useFileSystem.ts**
```typescript
export function useFileSystem(): {
  selectVault: () => Promise<string | null>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
};
```

**useKeyboardShortcuts.ts**
```typescript
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]): void;
// Registers global keyboard shortcuts
```

### types/

TypeScript type definitions shared across the app.

**note.ts**
```typescript
export interface Note {
  path: string;
  content: string;
  metadata: NoteMetadata;
}

export interface NoteMetadata {
  path: string;
  title: string;
  created: Date;
  modified: Date;
  tags: string[];
  links: string[];
  backlinks: string[];
}
```

**vault.ts**
```typescript
export interface VaultInfo {
  path: string;
  name: string;
  files: number;
  size: number;
}

export interface VaultFile {
  path: string;
  name: string;
  isDirectory: boolean;
  children?: VaultFile[];
}
```

**graph.ts**
```typescript
export interface GraphNode {
  id: string;
  label: string;
  type: 'file' | 'folder' | 'tag';
  path?: string;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'link' | '引用';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

**plugin.ts**
```typescript
export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  main: string;
  enabled: boolean;
}

export interface PluginAPI {
  app: AppAPI;
  note: NoteAPI;
  workspace: WorkspaceAPI;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  main: string;
  permissions?: string[];
}
```

**editor.ts**
```typescript
export interface Position {
  line: number;
  column: number;
}

export interface Selection {
  start: Position;
  end: Position;
}

export interface EditorMode {
  type: 'edit' | 'preview' | 'split';
}
```

### utils/

Utility functions.

**markdown.ts**
```typescript
export function parseLinks(content: string): string[];
export function parseTags(content: string): string[];
export function extractFrontmatter(content: string): Record<string, unknown>;
export function renderMarkdown(content: string): string;
```

**path.ts**
```typescript
export function joinPath(...parts: string[]): string;
export function dirname(path: string): string;
export function basename(path: string): string;
export function extname(path: string): string;
export function normalizePath(path: string): string;
```

**date.ts**
```typescript
export function formatDate(date: Date): string;
export function formatRelativeDate(date: Date): string;
export function isToday(date: Date): boolean;
export function isYesterday(date: Date): boolean;
```

**debounce.ts**
```typescript
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void;

export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void;
```

**classNames.ts**
```typescript
export function classNames(...classes: (string | boolean | undefined | null)[]): string;
```

## Key Design Decisions

### 1. Service Layer as IPC Abstraction

IPC calls are encapsulated in service modules rather than called directly from components or stores. This provides:
- **Testability**: Services can be mocked without actual Electron IPC
- **Type Safety**: Services provide typed interfaces for all IPC operations
- **Refactorability**: Changing IPC channels doesn't break component code

### 2. Store Pattern with @rabjs/react

Using @rabjs/react stores for global state provides:
- **Reactivity**: Automatic re-renders on state changes
- **Persistence**: Built-in support for persisting state to localStorage
- **DevTools**: Good debugging experience with state inspection

### 3. Hooks as Business Logic Bridge

Custom hooks (`useNote`, `useEditor`, etc.) bridge stores/services to components. This keeps components as thin as possible while making business logic testable and reusable.

### 4. Component Hierarchy

Components are organized by domain, not by type:
```
components/editor/   # Editor-specific components
components/graph/    # Graph components
components/ui/       # Generic UI primitives
```

This makes it easier to find related code and understand component dependencies.

### 5. Type-first Development

All types are defined in `types/` and exported through `index.ts` files in each module, providing a clear public API and enabling IDE autocompletion.

### 6. IPC Channel Naming Convention

IPC channels follow the pattern: `domain:action`
```
vault:open
vault:readNote
vault:writeNote
graph:getData
search:query
```

This makes it easy to find all operations in a domain and avoids naming collisions.

## Extension Points

### Adding a New Service

1. Create `services/new-service.ts`
2. Define the service interface and implementation
3. Export from `services/index.ts`
4. Use from hooks or stores

### Adding a New Store

1. Create `stores/new-store.ts` using @rabjs/react
2. Define state interface and actions
3. Export from `stores/index.ts`
4. Consume via `useNewStore()` hook

### Adding a New Page

1. Create `pages/new-page/NewPage.tsx`
2. Add route in `App.tsx`
3. Compose existing components
4. Connect to stores via hooks

### Plugin System

The `plugin.store.ts` and `plugin.service.ts` provide a foundation for extensibility:

1. Plugins are loaded from `vault/.aimo-note/plugins/`
2. Each plugin has a `manifest.json` defining its API requirements
3. Plugins receive a `PluginAPI` object with limited access to app functionality
4. Plugin state is isolated and can be enabled/disabled without restart

**Plugin API Surface:**
```typescript
interface PluginAPI {
  app: {
    getVersion(): string;
    getVaultPath(): string;
  };
  note: {
    open(path: string): Promise<Note>;
    create(path: string, content: string): Promise<Note>;
    update(note: Note): Promise<void>;
  };
  workspace: {
    getActiveNote(): Note | null;
    setStatusBarText(text: string): void;
  };
}
```

### Hot Module Replacement

Vite's HMR is configured for:
- Component changes: Instant UI update preserving state
- Store changes: State is preserved, subscribers re-render
- Service changes: May require page refresh for new implementations

## Testing Strategy

### Unit Testing Components

Components in `components/` should be testable in isolation:

```typescript
// components/ui/__tests__/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

test('renders with label', () => {
  render(<Button label="Click me" />);
  expect(screen.getByText('Click me')).toBeInTheDocument();
});

test('calls onClick when clicked', () => {
  const onClick = vi.fn();
  render(<Button label="Click me" onClick={onClick} />);
  fireEvent.click(screen.getByText('Click me'));
  expect(onClick).toHaveBeenCalled();
});
```

### Testing Hooks

Custom hooks are tested via `@testing-library/react`:

```typescript
// hooks/__tests__/useNote.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useNote } from '../useNote';

test('loads note content', async () => {
  const { result } = renderHook(() => useNote('/test/note.md'));
  await waitFor(() => expect(result.current.note).not.toBeNull());
});
```

### Testing Stores

@rabjs/react stores can be tested directly:

```typescript
// stores/__tests__/editor.store.test.ts
import { getStore } from '../editor.store';

test('sets current note', async () => {
  const store = getStore();
  await store.openNote('/test.md');
  expect(store.state.currentNote).not.toBeNull();
});
```

### Testing Services

Services use mock IPC, making them testable without Electron:

```typescript
// services/__tests__/vault.service.test.ts
import { vaultService } from '../vault.service';
import { mockIPC } from '@electron/test-utils';

test('opens vault', async () => {
  mockIPC('vault:open', () => ({ path: '/test', files: 10 }));
  const vault = await vaultService.open('/test');
  expect(vault.path).toBe('/test');
});
```

### Integration Testing

Pages and major flows are tested with Playwright:

```typescript
// e2e/editor.spec.ts
import { test, expect } from '@playwright/test';

test('edits and saves a note', async ({ page }) => {
  await page.goto('/editor/test.md');
  await page.fill('.editor-content', 'New content');
  await page.click('button:has-text("Save")');
  await expect(page.locator('.status-bar')).toContainText('Saved');
});
```

### Test File Locations

- Component tests: Next to source files `__tests__/` subdirectory
- Hook/Store tests: `__tests__/` in respective directories
- Service tests: `services/__tests__/`
- E2E tests: `e2e/` in project root
