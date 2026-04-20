# Theme Design Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the AIMO-Note theme design spec - a Notion-style minimal interface with shadow-first hierarchy, updated color system, and cohesive component styling.

**Architecture:** CSS variables define the design system in `index.css`. Tailwind config maps these to semantic classes. Components use Tailwind classes with CSS variable references. No border-based separations - use background colors and shadows for hierarchy.

**Tech Stack:** Tailwind CSS 3.4, CSS custom properties, React 19

---

## Chunk 1: CSS Variables & Design Tokens

### Task 1: Update CSS Variables in index.css

**Files:**

- Modify: `apps/render/src/index.css:1-31`

- [ ] **Step 1: Replace :root CSS variables**

Replace the entire `:root` block with the new design tokens:

```css
:root {
  /* Light Theme - Notion-inspired minimal */
  --bg-primary: #ffffff;
  --bg-secondary: #f7f7f7;
  --bg-tertiary: #ebebeb;
  --bg-quaternary: #e0e0e0;

  --text-primary: #1f1f1f;
  --text-secondary: #6e6e6e;
  --text-muted: #999999;

  --accent: #4ade80;
  --accent-hover: #22c55e;
  --accent-subtle: #f0fdf4;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);

  /* Spacing tokens (as CSS custom properties for reference) */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;

  /* Border radius tokens */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 6px;
  --radius-full: 50%;

  font-family:
    Menlo,
    'Meslo LG',
    'Helvetica Neue',
    Helvetica,
    Arial,
    sans-serif,
    '微软雅黑',
    monospace,
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light;
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 2: Run dev server to verify CSS loads**

Run: `pnpm --filter @aimo-note/render dev`
Expected: App loads with new CSS variables available (no compile errors)

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/index.css
git commit -m "feat(theme): update CSS variables to new design tokens"
```

---

### Task 2: Add Shadow Classes to index.css

**Files:**

- Modify: `apps/render/src/index.css` (append after existing styles)

- [ ] **Step 1: Add shadow utility classes**

Add after the existing styles (before `.left-rail`):

```css
/* Shadow utilities - Notion-style subtle shadows */
.shadow-sm {
  box-shadow: var(--shadow-sm);
}

.shadow-md {
  box-shadow: var(--shadow-md);
}

.shadow-lg {
  box-shadow: var(--shadow-lg);
}
```

- [ ] **Step 2: Run dev server and verify no errors**

Run: `pnpm --filter @aimo-note/render dev`
Expected: Clean startup

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/index.css
git commit -m "feat(theme): add shadow utility classes"
```

---

### Task 3: Update Scrollbar Styles in index.css

**Files:**

- Modify: `apps/render/src/index.css:67-91` (replace scrollbar styles)

- [ ] **Step 1: Update scrollbar to use new color system**

Replace the scrollbar section:

```css
/* Custom Scrollbar Styles - minimal, unobtrusive */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--bg-quaternary);
  border-radius: 3px;
  transition: background 0.15s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--bg-quaternary) transparent;
}
```

- [ ] **Step 2: Verify scrollbar styling works**

Run: `pnpm --filter @aimo-note/render dev`
Expected: Clean startup

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/index.css
git commit -m "feat(theme): update scrollbar colors to match design system"
```

---

## Chunk 2: Layout Components

### Task 4: Update Layout.tsx

**Files:**

- Modify: `apps/render/src/components/Layout.tsx:17-44`

- [ ] **Step 1: Remove title bar bottom border**

Change line 17:

```tsx
// Before
<div className="title-bar flex items-center px-3 py-1 border-b bg-bg-secondary">

// After
<div className="title-bar flex items-center px-3 py-1 bg-bg-secondary">
```

- [ ] **Step 2: Remove explorer border**

Change line 29:

```tsx
// Before
<aside className="explorer w-64 border-r flex flex-col bg-bg-primary">

// After
<aside className="explorer w-64 flex flex-col bg-bg-primary">
```

- [ ] **Step 3: Simplify editor container - remove border and margin**

Change line 40:

```tsx
// Before
<div className="editor-container flex-1 border m-2 rounded-md overflow-hidden">

// After
<div className="editor-container flex-1 bg-bg-primary m-2 overflow-hidden">
```

- [ ] **Step 4: Verify layout renders correctly**

Run: `pnpm --filter @aimo-note/render dev`
Expected: Title bar, explorer, and editor container have no visible borders

- [ ] **Step 5: Commit**

```bash
git add apps/render/src/components/Layout.tsx
git commit -m "feat(theme): remove borders from layout components"
```

---

### Task 5: Update LeftRail.tsx

**Files:**

- Modify: `apps/render/src/components/left-rail/LeftRail.tsx:26`

- [ ] **Step 1: Change background to tertiary and remove border**

```tsx
// Before
<aside className="left-rail w-12 border-r flex flex-col items-center py-2 gap-1 bg-bg-secondary">

// After
<aside className="left-rail w-12 flex flex-col items-center py-2 gap-1 bg-bg-tertiary">
```

- [ ] **Step 2: Update icon button hover to use accent color from spec**

Change line 33:

```tsx
// Before
className = 'p-2 hover:bg-accent hover:text-white rounded text-gray-400 transition-colors';

// After
className = 'p-2 hover:bg-accent hover:text-white rounded-full text-gray-400 transition-colors';
```

- [ ] **Step 3: Verify Left Rail renders with tertiary background**

Run: `pnpm --filter @aimo-note/render dev`
Expected: Left rail shows `--bg-tertiary` (#ebebeb) background

- [ ] **Step 4: Commit**

```bash
git add apps/render/src/components/left-rail/LeftRail.tsx
git commit -m "feat(theme): update LeftRail background to tertiary"
```

---

### Task 6: Update EditorTabs.tsx

**Files:**

- Modify: `apps/render/src/components/editor-tabs/EditorTabs.tsx:12-24`

- [ ] **Step 1: Remove border-b from tab container**

Change line 12:

```tsx
// Before
className = 'editor-tabs flex items-center border-b bg-bg-secondary overflow-x-auto';

// After
className = 'editor-tabs flex items-center bg-bg-secondary overflow-x-auto';
```

- [ ] **Step 2: Update active tab styling to use box-shadow accent bar instead of border**

Change lines 22-24:

```tsx
// Before
className={`editor-tab flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer hover:bg-bg-tertiary ${
  uiService.activeTabId === tab.id ? 'bg-bg-primary border-b-2 border-b-accent' : ''
}`}

// After
className={`editor-tab flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-bg-primary transition-colors ${
  uiService.activeTabId === tab.id ? 'bg-bg-primary shadow-[inset_0_-2px_0_var(--accent)]' : ''
}`}
```

- [ ] **Step 3: Verify tab styling**

Run: `pnpm --filter @aimo-note/render dev`
Expected: Active tab has bottom accent bar via box-shadow, not border

- [ ] **Step 4: Commit**

```bash
git add apps/render/src/components/editor-tabs/EditorTabs.tsx
git commit -m "feat(theme): update EditorTabs - remove borders, use box-shadow accent"
```

---

### Task 7: Update SidePanel.tsx

**Files:**

- Modify: `apps/render/src/components/side-panel/SidePanel.tsx:17-21`

- [ ] **Step 1: Remove border-l, update background to secondary**

Change line 17-18:

```tsx
// Before
<aside className="side-panel border-l flex flex-col bg-bg-secondary" style={{ width: uiService.sidePanelWidth }}>

// After
<aside className="side-panel flex flex-col bg-bg-secondary" style={{ width: uiService.sidePanelWidth }}>
```

- [ ] **Step 2: Update side panel header to use tertiary background**

Change line 21:

```tsx
// Before
<div className="side-panel-header flex items-center justify-between px-3 py-2 border-b">

// After
<div className="side-panel-header flex items-center justify-between px-3 py-2 bg-bg-tertiary">
```

- [ ] **Step 3: Verify side panel styling**

Run: `pnpm --filter @aimo-note/render dev`
Expected: Side panel has no left border, header uses tertiary background

- [ ] **Step 4: Commit**

```bash
git add apps/render/src/components/side-panel/SidePanel.tsx
git commit -m "feat(theme): update SidePanel - remove border, use tertiary header"
```

---

## Chunk 3: Component Styling

### Task 8: Update TreeNode.tsx

**Files:**

- Modify: `apps/render/src/components/explorer/TreeNode.tsx:94-112`

- [ ] **Step 1: Update selected state to use left accent bar via box-shadow**

Change line 99:

```tsx
// Before
className={`flex items-center gap-1 w-full px-2 py-1 hover:bg-accent rounded text-left ${nodeIsSelected ? 'bg-accent text-white' : ''}`}

// After
className={`flex items-center gap-1 w-full px-2 py-1 hover:bg-bg-secondary rounded text-left transition-colors ${nodeIsSelected ? 'bg-bg-tertiary shadow-[inset_3px_0_0_var(--accent)]' : ''}`}
```

- [ ] **Step 2: Verify TreeNode styling**

Run: `pnpm --filter @aimo-note/render dev`
Expected: Selected node has tertiary background with left accent bar (no solid accent background)

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/components/explorer/TreeNode.tsx
git commit -m "feat(theme): update TreeNode selected state with left accent bar"
```

---

### Task 9: Update SettingsModal.tsx

**Files:**

- Modify: `apps/render/src/components/common/SettingsModal.tsx:26-119`

- [ ] **Step 1: Update modal container to use card styling with shadow**

Change lines 33-34:

```tsx
// Before
<div className="relative w-[800px] h-[600px] bg-bg-primary rounded-lg shadow-lg flex overflow-hidden">

// After
<div className="relative w-[800px] h-[600px] bg-bg-primary rounded-md shadow-lg flex overflow-hidden">
```

- [ ] **Step 2: Update sidebar - remove border, use tertiary background**

Change lines 36-37:

```tsx
// Before
<div className="w-48 bg-bg-secondary border-r border-border">

// After
<div className="w-48 bg-bg-tertiary">
```

- [ ] **Step 3: Update sidebar header - remove border, change to secondary background**

Change lines 37-38:

```tsx
// Before
<div className="p-4 border-b border-border">

// After
<div className="p-4 bg-bg-secondary">
```

- [ ] **Step 4: Update content header - remove border**

Change lines 54-55:

```tsx
// Before
<div className="flex items-center justify-between p-4 border-b border-border">

// After
<div className="flex items-center justify-between p-4 bg-bg-secondary">
```

- [ ] **Step 5: Update theme button active state**

Change lines 72-76, 83-87, 96-100:

```tsx
// Before (line 72-76)
className={`flex items-center gap-2 px-4 py-2 rounded border ${
  uiService.theme === 'light'
    ? 'border-accent bg-accent-light text-accent'
    : 'border-border hover:bg-bg-tertiary'
}`}

// After
className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
  uiService.theme === 'light'
    ? 'bg-accent text-white'
    : 'hover:bg-bg-quaternary'
}`}
```

Apply same pattern to dark and system buttons.

- [ ] **Step 6: Verify Settings Modal styling**

Run: `pnpm --filter @aimo-note/render dev`
Expected: Modal uses card-style with shadow-md, no borders visible, tertiary sidebar

- [ ] **Step 7: Commit**

```bash
git add apps/render/src/components/common/SettingsModal.tsx
git commit -m "feat(theme): update SettingsModal to card-style with shadow"
```

---

## Chunk 4: Tailwind Configuration

### Task 10: Update Tailwind Config Mappings

**Files:**

- Modify: `apps/render/tailwind.config.js`

- [ ] **Step 1: Verify tailwind.config.js exists and read current content**

Run: `cat apps/render/tailwind.config.js`

- [ ] **Step 2: If colors need updating, ensure they map to CSS variables**

Current CLAUDE.md shows mapping should be:

```js
colors: {
  bg: {
    primary: 'var(--bg-primary)',
    secondary: 'var(--bg-secondary)',
    tertiary: 'var(--bg-tertiary)',
    quaternary: 'var(--bg-quaternary)',  // New
  },
  // ... existing mappings
}
```

- [ ] **Step 3: Verify Tailwind build works**

Run: `pnpm --filter @aimo-note/render build`
Expected: Successful build with no Tailwind warnings

- [ ] **Step 4: Commit**

```bash
git add apps/render/tailwind.config.js  # if modified
git commit -m "feat(theme): update Tailwind config with new design tokens"
```

---

## Chunk 5: Verification & Polish

### Task 11: Full Visual Verification

- [ ] **Step 1: Run app and visually verify all changes**

Run: `pnpm --filter @aimo-note/render dev`

Verify:

- Title bar has no bottom border (line 17 Layout.tsx)
- Left rail uses tertiary background (48px wide, icons centered)
- Explorer has no left border
- Editor tabs have no bottom border, active tab has accent bar via box-shadow
- Editor container has no border (just m-2 margin and bg-bg-primary)
- Side panel has no left border, header uses tertiary background
- TreeNode selected state shows left accent bar
- Settings modal shows card-style with shadow, no borders
- Scrollbar uses new color system

- [ ] **Step 2: Check for any remaining border usages that should be removed**

Search for `border-` in components:

```bash
grep -r "border-" apps/render/src/components --include="*.tsx" | grep -v "border-radius" | grep -v "shadow"
```

Expected: No remaining borders that conflict with spec (some border-radius is fine)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(theme): complete theme design implementation"
```

---

## Summary

| Chunk            | Tasks | Files Modified                                                  |
| ---------------- | ----- | --------------------------------------------------------------- |
| 1: CSS Variables | 1-3   | `index.css`                                                     |
| 2: Layout        | 4-7   | `Layout.tsx`, `LeftRail.tsx`, `EditorTabs.tsx`, `SidePanel.tsx` |
| 3: Components    | 8-9   | `TreeNode.tsx`, `SettingsModal.tsx`                             |
| 4: Config        | 10    | `tailwind.config.js`                                            |
| 5: Verification  | 11    | -                                                               |

**Total: 11 tasks across 7 files**
