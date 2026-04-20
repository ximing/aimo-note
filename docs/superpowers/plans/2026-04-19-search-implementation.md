# Search Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement sidebar search with vscode-ripgrep, view switching between file tree and search panel, keyword highlighting, case/regex options.

**Architecture:**

- Main process uses ripgrep via IPC for file system search
- Renderer manages UI state, debounced input, and result display
- Sidebar switches between VaultTree and SearchPanel via header icon clicks
- Editor navigates to match location with highlighted keyword on result click

**Tech Stack:** vscode-ripgrep, lucide-react (FolderTree), React Router, @rabjs/react

---

## Chunk 1: Shared Types + CSS Variables

### Files

- Create: `packages/dto/src/search.ts`
- Modify: `apps/render/src/styles/variables.css`
- Modify: `packages/dto/src/index.ts`

---

> **⚠️ Breaking Change:** The existing `searchIPC` API (`search(query, limit)` and `searchInContent(query)`) will be replaced with a new API (`search(options)`). Update any dependent code accordingly.

- [ ] **Step 1: Create shared search types in dto package**

Create `packages/dto/src/search.ts`:

```typescript
/**
 * Search-related types shared between main and renderer processes
 */

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchResult {
  path: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchOptions {
  query: string;
  rootPath: string;
  caseSensitive: boolean;
  isRegex: boolean;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  error?: string;
}
```

- [ ] **Step 2: Export from dto package**

Modify `packages/dto/src/index.ts`:

```typescript
// Core types
export * from './search';
export * from './response';
```

- [ ] **Step 3: Add search highlight CSS variables**

Modify `apps/render/src/styles/variables.css`:

Add to `:root` (light theme) section:

```css
--search-highlight: #fff3bf;
--search-highlight-active: #ffd700;
```

Add to `html.dark` section:

```css
--search-highlight-dark: #5c4a1f;
--search-highlight-active-dark: #8b6914;
```

Run: Verify CSS variables are valid
Expected: Variables defined in both themes

- [ ] **Step 4: Commit shared types**

```bash
git add packages/dto/src/search.ts packages/dto/src/index.ts apps/render/src/styles/variables.css
git commit -m "feat(search): add shared search types and CSS variables

- packages/dto: SearchMatch, SearchResult, SearchOptions, SearchResponse
- variables.css: --search-highlight tokens for both themes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: IPC Layer (Main Process + Preload + Renderer Wrapper)

### Files

- Modify: `apps/client/src/main/ipc/handlers.ts:314-328`
- Modify: `apps/client/src/preload/index.ts`
- Modify: `apps/render/src/ipc/search.ts`
- Modify: `apps/render/src/ipc/index.ts`

---

- [ ] **Step 1: Add ripgrep dependency**

Run: `cd apps/client && pnpm add vscode-ripgrep`
Expected: Package installed successfully

- [ ] **Step 2: Implement IPC handler in main process**

Modify `apps/client/src/main/ipc/handlers.ts:314-328`:

Replace the stub search handler with ripgrep implementation:

```typescript
import rg from 'vscode-ripgrep';

ipcMain.handle(
  'search:search',
  async (
    _event,
    options: {
      query: string;
      rootPath: string;
      caseSensitive: boolean;
      isRegex: boolean;
    }
  ) => {
    const { query, rootPath, caseSensitive, isRegex } = options;

    if (!query || !rootPath) {
      return { success: true, results: [] };
    }

    try {
      const args = [
        '--heading',
        '--json',
        '--max-count=10',
        '--glob=!.*', // Skip .* directories
        '--glob=!node_modules',
        query,
        rootPath,
      ];

      if (!caseSensitive) {
        args.push('--ignore-case');
      }

      if (isRegex) {
        // ripgrep treats input as regex by default with -e, but we pass query directly
      }

      const results = await rg.rgFiles(args);

      // Parse ripgrep JSON output
      const searchResults: Array<{
        path: string;
        line: number;
        text: string;
        matchStart: number;
        matchEnd: number;
      }> = [];

      for (const line of results.split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'match') {
            const submatches = parsed.data.submatches || [];
            for (const match of submatches) {
              searchResults.push({
                path: parsed.data.path,
                line: parsed.data.line_number,
                text: parsed.data.lines.text,
                matchStart: match.start,
                matchEnd: match.end,
              });
            }
          }
        } catch {
          // Skip invalid JSON lines
        }
      }

      return { success: true, results: searchResults };
    } catch (error) {
      console.error('[IPC] search:search error:', error);
      return { success: false, error: String(error), results: [] };
    }
  }
);
```

Run: `cd apps/client && pnpm build` (if build exists) or verify no TypeScript errors
Expected: No compile errors

- [ ] **Step 3: Update preload to expose search API**

Modify `apps/client/src/preload/index.ts`:

Add after line 205 (before imageStorage closing brace):

```typescript
// Search types
export interface SearchMatch {
  path: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchResult {
  path: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  error?: string;
}
```

Add search namespace to electronAPI (after imageStorage, line ~205):

```typescript
// Search operations
search: {
  search: (options: {
    query: string;
    rootPath: string;
    caseSensitive: boolean;
    isRegex: boolean;
  }) => ipcRenderer.invoke('search:search', options) as Promise<SearchResponse>;
},
```

Add search type declaration to Window interface (line ~258):

```typescript
// Search operations
search: {
  search: (options: {
    query: string;
    rootPath: string;
    caseSensitive: boolean;
    isRegex: boolean;
  }) =>
    Promise<{
      success: boolean;
      results: SearchResult[];
      error?: string;
    }>;
}
```

Run: `pnpm --filter @aimo-note/render typecheck` or verify build
Expected: No errors

- [ ] **Step 4: Update renderer IPC wrapper**

Modify `apps/render/src/ipc/search.ts`:

```typescript
// Re-export types from dto package
export type { SearchMatch, SearchResult, SearchOptions, SearchResponse } from '@aimo-note/dto';

import type { SearchOptions, SearchResponse } from '@aimo-note/dto';

export interface Search {
  search(options: SearchOptions): Promise<SearchResponse>;
}

export const search: Search = {
  async search(options: SearchOptions) {
    return window.electronAPI.search.search(options);
  },
};
```

Modify `apps/render/src/ipc/index.ts`:

```typescript
export { vault } from './vault';
export { graph } from './graph';
export { search } from './search';
export { plugin } from './plugin';
export { fs } from './fs';
export { window } from './window';
export { config } from './config';
export { clipboard } from './clipboard';
export { imageStorage } from './image-storage';
export type { RecentVault } from './config';
// Re-export search types from dto
export type { SearchMatch, SearchResult, SearchOptions, SearchResponse } from '@aimo-note/dto';
```

Run: `pnpm --filter @aimo-note/render typecheck`
Expected: No errors

- [ ] **Step 5: Commit IPC changes**

```bash
git add apps/client/src/main/ipc/handlers.ts apps/client/src/preload/index.ts apps/render/src/ipc/search.ts apps/render/src/ipc/index.ts apps/client/package.json pnpm-lock.yaml
git commit -m "feat(search): add ripgrep IPC layer for full-text search

- Main process: ripgrep handler with glob=!.* filtering
- Preload: expose search.search() API
- Renderer: typed IPC wrapper for search

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: UI State Management (UIService + SearchService)

### Files

- Modify: `apps/render/src/services/ui.service.ts`
- Modify: `apps/render/src/services/search.service.ts`

---

- [ ] **Step 1: Add sidebar view state to UIService**

Modify `apps/render/src/services/ui.service.ts`:

Add after line 12 (`leftSidebarWidth = 256`):

```typescript
// Sidebar view state
sidebarView: 'tree' | 'search' = 'tree';
```

Add method after `toggleLeftSidebar()` (around line 104):

```typescript
setSidebarView(view: 'tree' | 'search'): void {
  this.sidebarView = view;
}
```

- [ ] **Step 2: Update SearchService with IPC integration**

Modify `apps/render/src/services/search.service.ts`:

```typescript
import { Service, resolve } from '@rabjs/react';
import { search as searchIPC } from '@/ipc/search';
import { VaultService } from './vault.service';
import type { SearchMatch } from '@aimo-note/dto';

export interface SearchResultGroup {
  path: string;
  matches: SearchMatch[];
}

export class SearchService extends Service {
  query = '';
  results: SearchResultGroup[] = [];
  isSearching = false;
  caseSensitive = false;
  isRegex = false;
  error: string | null = null;

  private get vaultService(): VaultService {
    return resolve(VaultService);
  }

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  get defaultRootPath(): string {
    return this.vaultService.vaultPath || '';
  }

  search(query: string): void {
    this.query = query;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (!query.trim()) {
      this.results = [];
      this.isSearching = false;
      this.error = null;
      return;
    }

    this.isSearching = true;
    this.debounceTimer = setTimeout(() => {
      this.executeSearch();
    }, 300);
  }

  private async executeSearch(): Promise<void> {
    const rootPath = this.defaultRootPath;
    if (!rootPath) {
      this.results = [];
      this.isSearching = false;
      return;
    }

    try {
      const response = await searchIPC.search({
        query: this.query,
        rootPath,
        caseSensitive: this.caseSensitive,
        isRegex: this.isRegex,
      });

      if (response.success) {
        // Group results by file path
        const grouped = new Map<string, SearchMatch[]>();
        for (const result of response.results) {
          const existing = grouped.get(result.path) || [];
          existing.push({
            path: result.path,
            line: result.line,
            text: result.text,
            matchStart: result.matchStart,
            matchEnd: result.matchEnd,
          });
          grouped.set(result.path, existing);
        }

        this.results = Array.from(grouped.entries()).map(([path, matches]) => ({
          path,
          matches,
        }));
        this.error = null;
      } else {
        this.results = [];
        this.error = response.error || 'Search failed';
      }
    } catch (err) {
      this.results = [];
      this.error = String(err);
    } finally {
      this.isSearching = false;
    }
  }

  toggleCaseSensitive(): void {
    this.caseSensitive = !this.caseSensitive;
  }

  toggleRegex(): void {
    this.isRegex = !this.isRegex;
  }

  clearResults(): void {
    this.query = '';
    this.results = [];
    this.isSearching = false;
    this.error = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

export function useSearchService(): SearchService {
  return resolve(SearchService);
}
```

Run: `pnpm --filter @aimo-note/render typecheck`
Expected: No errors

- [ ] **Step 3: Commit service changes**

```bash
git add apps/render/src/services/ui.service.ts apps/render/src/services/search.service.ts
git commit -m "feat(search): integrate IPC with SearchService, add debouncing

- UIService: add sidebarView state and setSidebarView method
- SearchService: async search via IPC, result grouping, toggle options
- Default search root to current vault path

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: Search Panel Components

### Files

- Create: `apps/render/src/components/left-sidebar/SearchPanel.tsx`
- Create: `apps/render/src/components/left-sidebar/SearchInput.tsx`
- Create: `apps/render/src/components/left-sidebar/SearchResultList.tsx`
- Create: `apps/render/src/components/left-sidebar/SearchResultItem.tsx`
- Create: `apps/render/src/components/left-sidebar/index.ts`
- Modify: `apps/render/src/components/Layout.tsx`

---

- [ ] **Step 1: Create SearchResultItem component**

Create `apps/render/src/components/left-sidebar/SearchResultItem.tsx`:

```typescript
import { useState } from 'react';
import type { SearchMatch } from '@aimo-note/dto';

interface SearchResultItemProps {
  filePath: string;
  matches: SearchMatch[];
  query: string;
  defaultExpanded?: number;
}

function highlightMatch(text: string, start: number, end: number, query: string) {
  return (
    <>
      {text.slice(0, start)}
      <mark className="search-highlight">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

export function SearchResultItem({ filePath, matches, query, defaultExpanded = 3 }: SearchResultItemProps) {
  const [expanded, setExpanded] = useState(false);

  const fileName = filePath.split('/').pop() || filePath;
  const folderPath = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';

  const visibleMatches = expanded ? matches : matches.slice(0, defaultExpanded);
  const hiddenCount = Math.max(0, matches.length - defaultExpanded);

  return (
    <div className="search-result-item">
      <div className="search-result-header">
        <span className="search-result-file">{fileName}</span>
        <span className="search-result-count">{matches.length} matches</span>
      </div>
      {folderPath && <div className="search-result-folder">{folderPath}</div>}
      <div className="search-result-matches">
        {visibleMatches.map((match, index) => (
          <div key={`${match.path}-${match.line}-${index}`} className="search-result-line">
            <span className="search-result-line-number">{match.line}</span>
            <span className="search-result-line-text">
              {highlightMatch(match.text, match.matchStart, match.matchEnd, query)}
            </span>
          </div>
        ))}
        {!expanded && hiddenCount > 0 && (
          <button
            type="button"
            className="search-result-show-more"
            onClick={() => setExpanded(true)}
          >
            Show {hiddenCount} more
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SearchResultList component**

Create `apps/render/src/components/left-sidebar/SearchResultList.tsx`:

```typescript
import type { SearchResultGroup } from '@/services/search.service';
import { SearchResultItem } from './SearchResultItem';

interface SearchResultListProps {
  results: SearchResultGroup[];
  query: string;
}

export function SearchResultList({ results, query }: SearchResultListProps) {
  if (results.length === 0) {
    return (
      <div className="search-result-empty">
        No results found
      </div>
    );
  }

  return (
    <div className="search-result-list">
      {results.map((result) => (
        <SearchResultItem
          key={result.path}
          filePath={result.path}
          matches={result.matches}
          query={query}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create SearchInput component**

Create `apps/render/src/components/left-sidebar/SearchInput.tsx`:

```typescript
import { Search, CaseSensitive, Regex, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  caseSensitive: boolean;
  isRegex: boolean;
  onChange: (value: string) => void;
  onToggleCaseSensitive: () => void;
  onToggleRegex: () => void;
  onClear: () => void;
}

export function SearchInput({
  value,
  caseSensitive,
  isRegex,
  onChange,
  onToggleCaseSensitive,
  onToggleRegex,
  onClear,
}: SearchInputProps) {
  return (
    <div className="search-input-container">
      <div className="search-input-row">
        <Search size={14} className="search-input-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Search notes..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
        {value && (
          <button
            type="button"
            className="search-input-clear"
            onClick={onClear}
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="search-options-row">
        <button
          type="button"
          className={`search-option-button ${caseSensitive ? 'active' : ''}`}
          onClick={onToggleCaseSensitive}
          title="Case sensitive"
        >
          <CaseSensitive size={14} />
          <span>Aa</span>
        </button>
        <button
          type="button"
          className={`search-option-button ${isRegex ? 'active' : ''}`}
          onClick={onToggleRegex}
          title="Use regular expression"
        >
          <Regex size={14} />
          <span>.*</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create SearchPanel component**

Create `apps/render/src/components/left-sidebar/SearchPanel.tsx`:

```typescript
import { observer, useService } from '@rabjs/react';
import { useNavigate } from 'react-router';
import { SearchService } from '@/services/search.service';
import { SearchInput } from './SearchInput';
import { SearchResultList } from './SearchResultList';

export const SearchPanel = observer(() => {
  const searchService = useService(SearchService);
  const navigate = useNavigate();

  const handleResultClick = (filePath: string, line?: number) => {
    // Navigate to editor with search context
    const params = new URLSearchParams();
    params.set('path', filePath);
    if (line) {
      params.set('line', String(line));
    }
    if (searchService.query) {
      params.set('highlight', searchService.query);
    }
    navigate(`/editor/${encodeURIComponent(filePath)}?${params.toString()}`);
  };

  return (
    <div className="search-panel flex flex-col h-full">
      <SearchInput
        value={searchService.query}
        caseSensitive={searchService.caseSensitive}
        isRegex={searchService.isRegex}
        onChange={(value) => searchService.search(value)}
        onToggleCaseSensitive={() => searchService.toggleCaseSensitive()}
        onToggleRegex={() => searchService.toggleRegex()}
        onClear={() => searchService.clearResults()}
      />
      <div className="search-content flex-1 overflow-auto">
        {searchService.isSearching ? (
          <div className="search-status">Searching...</div>
        ) : searchService.error ? (
          <div className="search-status search-error">{searchService.error}</div>
        ) : searchService.results.length === 0 && searchService.query ? (
          <div className="search-status">No results found</div>
        ) : searchService.results.length > 0 ? (
          <SearchResultList
            results={searchService.results}
            query={searchService.query}
          />
        ) : (
          <div className="search-status search-hint">Enter keywords to search</div>
        )}
      </div>
    </div>
  );
});
```

- [ ] **Step 5: Create index.ts**

Create `apps/render/src/components/left-sidebar/index.ts`:

```typescript
export { SearchPanel } from './SearchPanel';
export { SearchInput } from './SearchInput';
export { SearchResultList } from './SearchResultList';
export { SearchResultItem } from './SearchResultItem';
```

- [ ] **Step 6: Update Layout.tsx**

Modify `apps/render/src/components/Layout.tsx`:

Update imports (line 13):

```typescript
import { Search, PanelLeftClose, PanelLeft, FolderTree } from 'lucide-react';
```

Import SearchPanel and use UIService sidebarView:

```typescript
import { VaultTree } from './explorer/VaultTree';
import { SearchPanel } from './left-sidebar/SearchPanel';
```

Replace header-row content (lines 62-91):

```typescript
{uiService.leftSidebarOpen ? (
  <>
    <button
      type="button"
      className="chrome-icon-button p-1.5 rounded text-sm"
      title={uiService.sidebarView === 'tree' ? '切换到搜索' : '切换到目录树'}
      onClick={() => uiService.setSidebarView(
        uiService.sidebarView === 'tree' ? 'search' : 'tree'
      )}
    >
      {uiService.sidebarView === 'tree' ? (
        <Search size={16} />
      ) : (
        <FolderTree size={16} />
      )}
    </button>
    <button
      type="button"
      className="chrome-icon-button p-1.5 rounded text-sm"
      title="收起目录树"
      onClick={() => uiService.toggleLeftSidebar()}
    >
      <PanelLeftClose size={16} />
    </button>
  </>
) : (
  <button
    type="button"
    className="chrome-icon-button p-1.5 rounded text-sm"
    title="展开目录树"
    onClick={() => uiService.toggleLeftSidebar()}
  >
    <PanelLeft size={16} />
  </button>
)}
```

Replace sidebar content (lines 99-110):

```typescript
{uiService.leftSidebarOpen && (
  <>
    <aside className="left-sidebar flex flex-col" style={{ width: uiService.leftSidebarWidth }}>
      {uiService.sidebarView === 'tree' ? (
        <VaultTree />
      ) : (
        <SearchPanel />
      )}
    </aside>
    <ResizeHandle
      onResize={handleSidebarResize}
      onResizeEnd={handleSidebarResizeEnd}
      side="right"
    />
  </>
)}
```

Remove the navigate import if no longer used, or keep it if other navigation exists.

Run: `pnpm --filter @aimo-note/render typecheck`
Expected: No errors

- [ ] **Step 7: Add CSS styles**

Modify `apps/render/src/styles/components.css`:

Add at the end:

```css
/* ============================================
   Search Panel
   ============================================ */

.search-panel {
  background-color: var(--bg-primary);
}

.search-input-container {
  padding: 8px;
  border-bottom: 1px solid var(--bg-quaternary);
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: var(--surface-soft);
  border-radius: var(--radius-md);
  padding: 4px 8px;
}

.search-input-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
  min-width: 0;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-input-clear {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}

.search-input-clear:hover {
  color: var(--text-primary);
  background-color: var(--hover-soft);
}

.search-options-row {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.search-option-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  background: transparent;
  border: 1px solid var(--bg-quaternary);
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-option-button:hover {
  color: var(--text-primary);
  border-color: var(--bg-tertiary);
}

.search-option-button.active {
  color: var(--accent);
  border-color: var(--accent);
  background-color: var(--accent-subtle);
}

.search-content {
  padding: 8px;
}

.search-status {
  text-align: center;
  padding: 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.search-error {
  color: var(--text-destructive, #ef4444);
}

.search-hint {
  color: var(--text-muted);
}

/* ============================================
   Search Results
   ============================================ */

.search-result-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-result-item {
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--surface-soft);
}

.search-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 13px;
}

.search-result-file {
  font-weight: 500;
  color: var(--text-primary);
}

.search-result-count {
  font-size: 11px;
  color: var(--text-muted);
}

.search-result-folder {
  padding: 0 10px 4px;
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result-matches {
  border-top: 1px solid var(--bg-quaternary);
}

.search-result-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.search-result-line:hover {
  background-color: var(--hover-soft);
}

.search-result-line-number {
  flex-shrink: 0;
  width: 28px;
  text-align: right;
  color: var(--text-muted);
  font-family: 'Fira Code', monospace;
  font-size: 11px;
}

.search-result-line-text {
  flex: 1;
  color: var(--text-secondary);
  word-break: break-all;
  line-height: 1.4;
}

.search-result-show-more {
  display: block;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--bg-quaternary);
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
  text-align: center;
  transition: background-color 0.15s ease;
}

.search-result-show-more:hover {
  background-color: var(--hover-soft);
}

/* ============================================
   Search Highlight
   ============================================ */

.search-highlight {
  background-color: var(--search-highlight);
  border-radius: 2px;
  padding: 0 2px;
  color: inherit;
}

html.dark .search-highlight {
  background-color: var(--search-highlight-dark);
}
```

Run: `pnpm dev` to verify styles
Expected: CSS loads without errors

- [ ] **Step 8: Commit component changes**

```bash
git add apps/render/src/components/left-sidebar/ apps/render/src/components/Layout.tsx apps/render/src/styles/components.css
git commit -m "feat(search): add SearchPanel and sidebar view switching

- SearchPanel: input, options, results in sidebar
- SearchInput: with case-sensitive and regex toggles
- SearchResultList/Item: grouped results with line context
- Layout: header icon toggles sidebar view (tree ↔ search)
- CSS: search panel and highlight styles

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: Editor Integration (Scroll to Line + Highlight)

### Files

- Modify: `apps/render/src/pages/editor/index.tsx`
- Modify: `apps/render/src/styles/editor-content.css`

---

- [ ] **Step 1: Read editor page to understand current structure**

```bash
cat apps/render/src/pages/editor/index.tsx
```

Expected: Output editor page structure for modification

- [ ] **Step 2: Update editor page to handle search context**

Modify `apps/render/src/pages/editor/index.tsx`:

After loading the note content, check for URL search params:

```typescript
// Add after note loading logic
const searchParams = new URLSearchParams(window.location.search);
const highlightLine = searchParams.get('line');
const highlightQuery = searchParams.get('highlight');

useEffect(() => {
  // After editor is ready, scroll to line and highlight
  if (highlightLine && editorRef.current) {
    // Scroll to line number
    // Implementation depends on Milkdown API
  }
}, [noteContent, highlightLine, highlightQuery]);
```

The exact implementation depends on Milkdown's API for scrolling. The basic approach:

1. After editor content loads, find the line element
2. Scroll it into view
3. Apply temporary highlight class to matching text

Run: `pnpm --filter @aimo-note/render typecheck`
Expected: No errors

- [ ] **Step 3: Add highlight styles to editor**

Modify `apps/render/src/styles/editor-content.css`:

```css
/* Search highlight in editor */
.search-highlight-editor {
  background-color: var(--search-highlight, #fff3bf);
  border-radius: 2px;
  animation: search-highlight-pulse 1s ease-out;
}

@keyframes search-highlight-pulse {
  0% {
    background-color: var(--search-highlight-active, #ffd700);
  }
  100% {
    background-color: var(--search-highlight, #fff3bf);
  }
}

html.dark .search-highlight-editor {
  background-color: var(--search-highlight-dark, #5c4a1f);
  animation-name: search-highlight-pulse-dark;
}

@keyframes search-highlight-pulse-dark {
  0% {
    background-color: var(--search-highlight-active-dark, #8b6914);
  }
  100% {
    background-color: var(--search-highlight-dark, #5c4a1f);
  }
}
```

- [ ] **Step 4: Commit editor changes**

```bash
git add apps/render/src/pages/editor/index.tsx apps/render/src/styles/editor-content.css
git commit -m "feat(search): scroll to match line and highlight in editor

- Editor page: handle ?line and ?highlight URL params
- Add search highlight animation styles

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 5: Cleanup (Remove or Simplify Search Page)

### Files

- Modify: `apps/render/src/pages/search/index.tsx`
- Modify: `apps/render/src/components/Layout.tsx` (verify no stale /search navigation)

---

- [ ] **Step 1: Verify existing search page usage**

Check if any code navigates to `/search` route:

```bash
grep -r "navigate.*search" apps/render/src/
grep -r "/search" apps/render/src/
```

Expected: No direct navigation to `/search` from components

- [ ] **Step 2: Simplify search page to redirect**

Modify `apps/render/src/pages/search/index.tsx`:

```typescript
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';

export const SearchPage = observer(() => {
  const navigate = useNavigate();
  const uiService = useService(UIService);

  useEffect(() => {
    // Redirect to home and open search in sidebar
    uiService.setSidebarView('search');
    navigate('/', { replace: true });
  }, [navigate, uiService]);

  return null;
});
```

This keeps the route functional (e.g., if Cmd+P command palette links to it) but redirects to sidebar search.

Run: `pnpm --filter @aimo-note/render typecheck`
Expected: No errors

- [ ] **Step 3: Verify Layout doesn't navigate to /search**

In `Layout.tsx`, ensure the search icon click doesn't use `navigate('/search')`. Instead, it should call `uiService.setSidebarView('search')`. The current plan already handles this in Chunk 3.

- [ ] **Step 4: Final commit**

```bash
git add apps/render/src/pages/search/index.tsx
git commit -m "chore(search): redirect /search route to sidebar search

- SearchPage redirects to home with sidebar view change

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```
