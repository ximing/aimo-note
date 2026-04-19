# Layout Color Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4-layer color hierarchy for layout regions - header-row, left-rail, left-sidebar, main-content - with colors fading from dark to light outer-to-inner.

**Architecture:** Add CSS variables for layout-specific backgrounds and apply them to existing components. No structural changes.

**Tech Stack:** CSS custom properties, Tailwind CSS, React components

---

## Chunk 1: CSS Variables

**Files:**
- Modify: `apps/render/src/index.css:1-50`

- [ ] **Step 1: Add CSS variables to :root (Light theme)**

Find `:root {` section in `apps/render/src/index.css`, add after existing `--bg-*` variables:

```css
  /* Layout layer colors (outer → inner, dark → light) */
  --bg-header: #e2dfd8;
  --bg-rail: #e8e6e0;
  --bg-sidebar: #f2f1ed;
```

- [ ] **Step 2: Add CSS variables to html.dark**

Find `html.dark {` section in `apps/render/src/index.css`, add after existing `--bg-*` variables:

```css
  /* Layout layer colors (outer → inner, dark → light) */
  --bg-header: #2f2f2f;
  --bg-rail: #2a2a2a;
  --bg-sidebar: #1e1e1e;
```

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/index.css
git commit -m "feat(ui): add layout layer CSS variables"
```

---

## Chunk 2: Apply Colors to Components

**Files:**
- Modify: `apps/render/src/index.css:176-245`
- Modify: `apps/render/src/components/Layout.tsx:34`
- Modify: `apps/render/src/components/left-rail/LeftRail.tsx:26`
- Modify: `apps/render/src/components/explorer/VaultTree.tsx`

- [ ] **Step 1: Update .header-row CSS class in index.css**

Find `.header-row {` (around line 187) and update background-color:

```css
.header-row {
  display: flex;
  align-items: center;
  min-height: 40px;
  background-color: var(--bg-header);
}
```

- [ ] **Step 2: Update .left-rail CSS class in index.css**

Find `.left-rail {` (around line 216) and update background-color:

```css
.left-rail {
  display: flex;
  flex-direction: column;
  width: 48px;
  height: 100%;
  background-color: var(--bg-rail);
  padding-top: 0;
}
```

- [ ] **Step 3: Update .left-sidebar CSS class in index.css**

Find `.left-sidebar {` (around line 225) and update background-color:

```css
.left-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-sidebar);
  overflow: hidden;
}
```

- [ ] **Step 4: Update .left-column CSS class in index.css**

Find `.left-column {` (around line 200) - remove or update background-color since child elements now have their own backgrounds:

```css
.left-column {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* background removed - children handle their own backgrounds */
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/render/src/index.css
git commit -m "feat(ui): apply layout layer colors to CSS classes"
```

---

## Chunk 3: Verify and Test

**Files:**
- Modify: `apps/render/src/components/Layout.tsx`
- Modify: `apps/render/src/components/left-rail/LeftRail.tsx`

- [ ] **Step 1: Verify header-row in Layout.tsx uses correct class**

Check that `Layout.tsx:34` has:
```tsx
<div className="header-row pl-16 flex items-center gap-1 px-3 py-1">
```
(No change needed - CSS class is already `.header-row`)

- [ ] **Step 2: Verify left-rail in LeftRail.tsx uses correct class**

Check that `LeftRail.tsx:26` has:
```tsx
<aside className="left-rail w-12 flex flex-col items-center pt-12 py-2 gap-1">
```
(No change needed - CSS class is already `.left-rail`)

- [ ] **Step 3: Run dev server to verify**

```bash
pnpm --filter @aimo-note/render dev
```

Open browser and verify:
- header-row has `--bg-header` color
- left-rail has `--bg-rail` color
- left-sidebar has `--bg-sidebar` color
- main-content has `--bg-primary` color

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(ui): verify layout color application"
```

---

## Summary

| Chunk | Tasks | Files |
|-------|-------|-------|
| 1 | Add CSS variables | `index.css` |
| 2 | Apply colors to CSS classes | `index.css` |
| 3 | Verify components use correct classes | `Layout.tsx`, `LeftRail.tsx` |
