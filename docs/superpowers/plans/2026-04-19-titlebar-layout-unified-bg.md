# Titlebar Layout Unified Background Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the background color of Left Rail, Left Sidebar Header, and Left Sidebar Content to `--bg-secondary`.

**Architecture:** Simple CSS class change - replace `bg-bg-tertiary` and `bg-bg-primary` with `bg-bg-secondary` in two components.

**Tech Stack:** React, Tailwind CSS

---

## Overview

This plan implements the design decision from `docs/superpowers/specs/2026-04-19-titlebar-layout-design.md`.

### Changes Required

| File | Line | Change |
|------|------|--------|
| `apps/render/src/components/left-rail/LeftRail.tsx` | 26 | `bg-bg-tertiary` → `bg-bg-secondary` |
| `apps/render/src/components/Layout.tsx` | 25 | `bg-bg-primary` → `bg-bg-secondary` |

---

## Chunk 1: CSS Background Unification

### Task 1: Update LeftRail background color

**Files:**
- Modify: `apps/render/src/components/left-rail/LeftRail.tsx:26`

- [ ] **Step 1: Change LeftRail background from bg-bg-tertiary to bg-bg-secondary**

Modify line 26 in `LeftRail.tsx`:
```tsx
// Before
<aside className="left-rail w-12 flex flex-col items-center pt-12 py-2 gap-1 bg-bg-tertiary">

// After
<aside className="left-rail w-12 flex flex-col items-center pt-12 py-2 gap-1 bg-bg-secondary">
```

### Task 2: Update LeftSidebar background color

**Files:**
- Modify: `apps/render/src/components/Layout.tsx:25`

- [ ] **Step 2: Change LeftSidebar background from bg-bg-primary to bg-bg-secondary**

Modify line 25 in `Layout.tsx`:
```tsx
// Before
<aside className="left-sidebar w-64 flex flex-col bg-bg-primary">

// After
<aside className="left-sidebar w-64 flex flex-col bg-bg-secondary">
```

### Task 3: Verify and commit

- [ ] **Step 3: Verify the changes visually**

Run the app and verify:
1. Left Rail (48px vertical strip) now has `bg-secondary` background
2. Left Sidebar now has `bg-secondary` background
3. Both match the Left Sidebar Header background

- [ ] **Step 4: Commit the changes**

```bash
git add apps/render/src/components/left-rail/LeftRail.tsx apps/render/src/components/Layout.tsx
git commit -m "feat(ui): unify left sidebar background colors

- Change LeftRail background from bg-tertiary to bg-secondary
- Change LeftSidebar background from bg-primary to bg-secondary

All three areas now use --bg-secondary for visual consistency."

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Verification Checklist

- [ ] Left Rail uses `bg-bg-secondary`
- [ ] Left Sidebar uses `bg-bg-secondary`
- [ ] Left Sidebar Header already uses `bg-bg-secondary` (no change needed)
- [ ] All three areas have the same background color in both light and dark themes
- [ ] No visual regressions in other UI areas
