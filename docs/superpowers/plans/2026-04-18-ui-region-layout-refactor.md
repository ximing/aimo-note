# UI Region Layout Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the app layout from a simple 2-column layout to a 5-region layout (Left Rail, Explorer, Title Bar Actions, Editor Tabs, Side Panel) per the naming spec.

**Architecture:** The Layout.tsx will be restructured to include all 5 regions. The old sidebar will be decomposed into Left Rail (icons) + Explorer (file tree). New components will be created for Title Bar Actions, Editor Tabs, and Side Panel. UIService will manage global UI state for all regions.

**Tech Stack:** React 19, Tailwind CSS, @rabjs/react, React Router 7

---

## File Structure Changes

### New Files to Create

```
apps/render/src/components/
├── left-rail/
│   ├── LeftRail.tsx          # Left icon navigation bar
│   └── index.ts
├── titlebar-actions/
│   ├── TitleBarActions.tsx   # Traffic light旁边的图标
│   └── index.ts
├── editor-tabs/
│   ├── EditorTabs.tsx        # Multi-tab management
│   └── index.ts
└── side-panel/
    ├── SidePanel.tsx         # Right side panel
    └── index.ts
```

### Files to Modify

```
apps/render/src/components/
├── Layout.tsx                # Restructure to 5-region layout
├── explorer/
│   ├── VaultTree.tsx         # Rename root class to .explorer
│   └── SidebarHeader.tsx     # Rename class to .explorer-header
├── index.css                 # Add CSS for new regions
apps/render/src/services/
└── ui.service.ts             # Add state for all 5 regions
```

---

## Chunk 1: UIService State Management

**Goal:** Add global UI state for all 5 regions to UIService.

**Files:**

- Modify: `apps/render/src/services/ui.service.ts`

- [ ] **Step 1: Add state properties to UIService**

Add the following properties to `UIService` class:

```typescript
// Left Rail
leftRailOpen = true;

// Explorer
explorerOpen = true;

// Title Bar Actions
titleBarActionsOpen = true;

// Editor Tabs
tabs: Array<{ id: string; path: string; title: string }> = [];
activeTabId: string | null = null;

// Side Panel
sidePanelOpen = false;
sidePanelWidth = 280; // px
activeSidePanelTab: 'backlinks' | 'outline' | 'tags' = 'backlinks';
```

- [ ] **Step 2: Add action methods**

```typescript
// Left Rail
toggleLeftRail(): void {
  this.leftRailOpen = !this.leftRailOpen;
}

// Explorer
toggleExplorer(): void {
  this.explorerOpen = !this.explorerOpen;
}

// Title Bar Actions (always visible, no toggle needed for now)

// Editor Tabs
openTab(path: string, title: string): void {
  const existing = this.tabs.find(t => t.path === path);
  if (existing) {
    this.activeTabId = existing.id;
  } else {
    const id = `tab-${Date.now()}`;
    this.tabs = [...this.tabs, { id, path, title }];
    this.activeTabId = id;
  }
}

closeTab(id: string): void {
  const idx = this.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  this.tabs = this.tabs.filter(t => t.id !== id);
  if (this.activeTabId === id) {
    // Activate adjacent tab
    this.activeTabId = this.tabs[idx - 1]?.id ?? this.tabs[idx]?.id ?? null;
  }
}

setActiveTab(id: string): void {
  this.activeTabId = id;
}

// Side Panel
toggleSidePanel(): void {
  this.sidePanelOpen = !this.sidePanelOpen;
}

setSidePanelWidth(width: number): void {
  this.sidePanelWidth = Math.max(200, Math.min(600, width));
}
```

- [ ] **Step 3: Handle migration from old sidebarOpen**

The existing UIService has `sidebarOpen = true`. Remove this property and replace with the new `leftRailOpen` and `explorerOpen` properties. The old sidebar is being decomposed into these two separate regions.

- [ ] **Step 4: Commit**

```bash
git add apps/render/src/services/ui.service.ts
git commit -m "feat(ui): add state for 5-region layout"
```

---

## Chunk 2: Left Rail Component

**Goal:** Create the Left Rail component (vertical icon navigation bar).

**Files:**

- Create: `apps/render/src/components/left-rail/LeftRail.tsx`
- Create: `apps/render/src/components/left-rail/index.ts`
- Modify: `apps/render/src/index.css`

- [ ] **Step 1: Create LeftRail.tsx**

```tsx
import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';
import { Search, FileText, GitBranch, Settings } from 'lucide-react';

const navItems = [
  { id: 'search', icon: Search, label: '搜索', path: '/search' },
  { id: 'files', icon: FileText, label: '文件', path: '/editor' },
  { id: 'graph', icon: GitBranch, label: '图谱', path: '/graph' },
  { id: 'settings', icon: Settings, label: '设置', path: '/settings' },
];

export const LeftRail = observer(() => {
  const uiService = useService(UIService);

  if (!uiService.leftRailOpen) return null;

  return (
    <aside className="left-rail w-12 border-r flex flex-col items-center py-2 gap-1 bg-bg-secondary">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className="p-2 hover:bg-accent hover:text-white rounded text-gray-400 transition-colors"
            title={item.label}
            onClick={() => {
              if (item.path.startsWith('/editor')) {
                // Special handling for editor - open in tab
                uiService.openTab('', 'New Note');
              }
              window.location.href = item.path;
            }}
          >
            <Icon size={20} />
          </button>
        );
      })}
    </aside>
  );
});
```

- [ ] **Step 2: Create index.ts**

```typescript
export { LeftRail } from './LeftRail';
```

- [ ] **Step 3: Commit (no CSS changes needed - Tailwind classes are sufficient)**

```bash
git add apps/render/src/components/left-rail/
git add apps/render/src/index.css
git commit -m "feat(ui): add LeftRail component"
```

---

## Chunk 3: Title Bar Actions Component

**Goal:** Create Title Bar Actions component for icons next to traffic lights.

**Files:**

- Create: `apps/render/src/components/titlebar-actions/TitleBarActions.tsx`
- Create: `apps/render/src/components/titlebar-actions/index.ts`

- [ ] **Step 1: Create TitleBarActions.tsx**

```tsx
import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';
import { Search, FolderTree } from 'lucide-react';

export const TitleBarActions = observer(() => {
  const uiService = useService(UIService);

  if (!uiService.titleBarActionsOpen) return null;

  return (
    <div className="titlebar-actions flex items-center gap-1">
      <button
        type="button"
        className="p-1.5 hover:bg-accent hover:text-white rounded text-sm"
        title="搜索"
        onClick={() => {
          window.location.href = '/search';
        }}
      >
        <Search size={16} />
      </button>
      <button
        type="button"
        className="p-1.5 hover:bg-accent hover:text-white rounded text-sm"
        title="文件树"
        onClick={() => {
          uiService.toggleExplorer();
        }}
      >
        <FolderTree size={16} />
      </button>
    </div>
  );
});
```

- [ ] **Step 2: Create index.ts**

```typescript
export { TitleBarActions } from './TitleBarActions';
```

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/components/titlebar-actions/
git commit -m "feat(ui): add TitleBarActions component"
```

---

## Chunk 4: Editor Tabs Component

**Goal:** Create Editor Tabs component for multi-tab document management.

**Files:**

- Create: `apps/render/src/components/editor-tabs/EditorTabs.tsx`
- Create: `apps/render/src/components/editor-tabs/index.ts`

- [ ] **Step 1: Create EditorTabs.tsx**

```tsx
import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';
import { X } from 'lucide-react';

export const EditorTabs = observer(() => {
  const uiService = useService(UIService);

  if (!uiService.tabs.length) return null;

  return (
    <div className="editor-tabs flex items-center border-b bg-bg-secondary overflow-x-auto">
      {uiService.tabs.map((tab) => (
        <div
          key={tab.id}
          className={`editor-tab flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer hover:bg-bg-tertiary ${
            uiService.activeTabId === tab.id ? 'bg-bg-primary border-b-2 border-b-accent' : ''
          }`}
          onClick={() => {
            uiService.setActiveTab(tab.id);
          }}
          onDoubleClick={() => {
            // Double click does nothing additional for now
          }}
        >
          <span className="text-sm truncate max-w-32">{tab.title || 'Untitled'}</span>
          <button
            type="button"
            className="p-0.5 hover:bg-accent hover:text-white rounded"
            onClick={(e) => {
              e.stopPropagation();
              uiService.closeTab(tab.id);
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
});
```

- [ ] **Step 2: Create index.ts**

```typescript
export { EditorTabs } from './EditorTabs';
```

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/components/editor-tabs/
git commit -m "feat(ui): add EditorTabs component"
```

---

## Chunk 5: Side Panel Component

**Goal:** Create Side Panel component for right-side collapsible panels.

**Files:**

- Create: `apps/render/src/components/side-panel/SidePanel.tsx`
- Create: `apps/render/src/components/side-panel/index.ts`

- [ ] **Step 1: Create SidePanel.tsx**

```tsx
import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';
import { X, Link, List, Tag } from 'lucide-react';

const panelTabs = [
  { id: 'backlinks', icon: Link, label: 'Backlinks' },
  { id: 'outline', icon: List, label: 'Outline' },
  { id: 'tags', icon: Tag, label: 'Tags' },
] as const;

export const SidePanel = observer(() => {
  const uiService = useService(UIService);

  if (!uiService.sidePanelOpen) return null;

  return (
    <aside
      className="side-panel border-l flex flex-col bg-bg-secondary"
      style={{ width: uiService.sidePanelWidth }}
    >
      <div className="side-panel-header flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-1">
          {panelTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={`p-1.5 rounded text-sm ${
                  uiService.activeSidePanelTab === tab.id
                    ? 'bg-accent text-white'
                    : 'hover:bg-accent hover:text-white'
                }`}
                title={tab.label}
                onClick={() => {
                  uiService.activeSidePanelTab = tab.id;
                }}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="p-1 hover:bg-accent hover:text-white rounded"
          onClick={() => uiService.toggleSidePanel()}
        >
          <X size={16} />
        </button>
      </div>
      <div className="side-panel-content flex-1 overflow-auto p-3">
        {/* Panel content based on active tab */}
        {uiService.activeSidePanelTab === 'backlinks' && (
          <div className="text-sm text-text-secondary">No backlinks yet</div>
        )}
        {uiService.activeSidePanelTab === 'outline' && (
          <div className="text-sm text-text-secondary">No outline available</div>
        )}
        {uiService.activeSidePanelTab === 'tags' && (
          <div className="text-sm text-text-secondary">No tags found</div>
        )}
      </div>
    </aside>
  );
});
```

- [ ] **Step 2: Create index.ts**

```typescript
export { SidePanel } from './SidePanel';
```

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/components/side-panel/
git commit -m "feat(ui): add SidePanel component"
```

---

## Chunk 6: Restructure Layout.tsx

**Goal:** Update the main Layout component to include all 5 regions.

**Files:**

- Modify: `apps/render/src/components/Layout.tsx`

- [ ] **Step 1: Update Layout.tsx**

Replace the current Layout with the new structure:

```tsx
import { Outlet } from 'react-router';
import { observer } from '@rabjs/react';
import { useUIService } from '@/services/ui.service';
import { LeftRail } from './left-rail';
import { TitleBarActions } from './titlebar-actions';
import { EditorTabs } from './editor-tabs';
import { SidePanel } from './side-panel';
import { VaultTree } from './explorer/VaultTree';

export const Layout = observer(() => {
  const uiService = useUIService();

  return (
    <div className="app-layout h-screen flex flex-col">
      {/* Title Bar Row - Electron handles native traffic lights */}
      <div className="title-bar flex items-center justify-between px-3 py-1 border-b bg-bg-secondary">
        {/* Spacer to balance Title Bar Actions on the right */}
        <div className="flex-1" />

        {/* Title Bar Actions - icons next to traffic lights area */}
        <TitleBarActions />
      </div>

      {/* Main Content Area */}
      <div className="main-area flex flex-1 overflow-hidden">
        {/* Left Rail */}
        <LeftRail />

        {/* Explorer (File Tree) */}
        {uiService.explorerOpen && (
          <aside className="explorer w-64 border-r flex flex-col bg-bg-primary">
            <div className="explorer-header p-2 border-b">
              <h1 className="text-sm font-semibold">AIMO Note</h1>
            </div>
            <div className="explorer-content flex-1 overflow-auto">
              <VaultTree />
            </div>
          </aside>
        )}

        {/* Main Content */}
        <main className="main-content flex-1 flex flex-col overflow-hidden">
          {/* Editor Tabs */}
          <EditorTabs />

          {/* Page Content */}
          <div className="page-content flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>

        {/* Side Panel */}
        <SidePanel />
      </div>
    </div>
  );
});
```

**Note:** macOS traffic lights are rendered natively by Electron and cannot be customized via HTML. The traffic lights appear in the native window chrome, not in the renderer HTML.

- [ ] **Step 2: Update CSS classes in explorer components**

Modify `SidebarHeader.tsx` to use `.explorer-header` class name:

```tsx
// Change className from "sidebar-header" to "explorer-header"
<div className="explorer-header flex items-center gap-1 px-2 py-2 border-b border-border">
```

Modify `VaultTree.tsx` to wrap content in `.explorer-content`:

```tsx
// Already has sidebar-content, rename to explorer-content
<div className="explorer-content flex-1 overflow-auto">
```

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/components/Layout.tsx
git add apps/render/src/components/explorer/SidebarHeader.tsx
git add apps/render/src/components/explorer/VaultTree.tsx
git commit -m "feat(layout): restructure to 5-region layout"
```

---

## Chunk 7: Update EditorPage for Tab Support

**Goal:** Update EditorPage to integrate with Editor Tabs and support single/double click behaviors.

**Files:**

- Modify: `apps/render/src/pages/editor/index.tsx`
- Modify: `apps/render/src/services/ui.service.ts` (add tab integration)

- [ ] **Step 1: Update EditorPage to open notes in tabs**

Modify `EditorPage/index.tsx`:

```tsx
// In the useEffect that opens a note, also open a tab
useEffect(() => {
  if (!path) return;

  let cancelled = false;

  const openNoteWhenReady = async () => {
    if (vaultService.path) {
      console.log('[EditorPage] Vault ready, opening note:', path);
      await service.openNote(path);
      // Open in tab
      uiService.openTab(path, path.split('/').pop() || 'Untitled');
      return;
    }
    // ... wait logic same as before
  };

  openNoteWhenReady();
  return () => {
    cancelled = true;
  };
}, [path, service, uiService]);
```

Also inject `UIService` into the page using the existing `useUIService()` hook pattern:

```tsx
import { useUIService } from '@/services/ui.service';

const EditorPageContent = observer(() => {
  // ... existing code
  const uiService = useUIService();
  // ...
});
```

**Note:** The codebase defines `useUIService()` as a dedicated hook in `ui.service.ts`. Use this instead of `useService(UIService)` for consistency.

- [ ] **Step 2: Add double-click on tree nodes to open in new tab**

This would be handled in `TreeNode.tsx` - add a `onDoubleClick` handler that calls `uiService.openTab()`.

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/pages/editor/index.tsx
git commit -m "feat(editor): integrate with EditorTabs"
```

---

## Chunk 8: CSS Updates

**Goal:** Clean up old CSS classes and ensure new regions are styled correctly.

**Files:**

- Modify: `apps/render/src/index.css`

- [ ] **Step 1: Add/update CSS variables and remove old unused classes**

Add any custom styles needed for the new layout regions.

- [ ] **Step 2: Commit**

```bash
git add apps/render/src/index.css
git commit -m "style(ui): update CSS for new layout regions
```

---

## Verification

Run the app and verify:

1. Left Rail appears on the left with icon navigation
2. Explorer (file tree) appears next to Left Rail
3. Title Bar Actions appear next to traffic lights
4. Editor Tabs appear in the main content area when opening notes
5. Side Panel can be toggled and shows panel tabs

---

## Dependencies

- `@rabjs/react` - already in use for state management
- `lucide-react` - already in use for icons

## Notes

- **Status Bar:** The spec diagram shows a Status Bar at the bottom. This is **out of scope** for this implementation - it will be added in a future phase.
- **Tab double-click behavior:** The spec mentions "双击开新 tab" (double-click opens new tab). This behavior is **deferred** to a future phase. The current implementation supports single-click tab switching only.
- Tab persistence (saving open tabs across sessions) is out of scope for this initial implementation
- The Side Panel content (backlinks, outline, tags) will be implemented in future phases
