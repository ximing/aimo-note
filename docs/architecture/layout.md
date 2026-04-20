# Layout Architecture

## Overview

AIMO-Note uses a nested layout with the following hierarchy:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  app-layout (h-screen, flex col)                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─ main-area (flex row, flex-1, overflow-hidden) ────────────────────────┐ │
│  │                                                                       │ │
│  │  ┌─ left-column (flex col) ──┐  ┌─ right-column ─┐  ┌─ SidePanel ─┐   │ │
│  │  │                           │  │               │  │             │   │ │
│  │  │  header-row (pl-12)       │  │  EditorTabs   │  │             │   │ │
│  │  │  [Search] [Collapse]      │  │               │  │             │   │ │
│  │  │──────────────────────────│  │───────────────│  │             │   │ │
│  │  │                           │  │               │  │             │   │ │
│  │  │  content-area (flex row) │  │  main-content │  │             │   │ │
│  │  │  ┌───────┬─────────────┐ │  │  (editor)     │  │             │   │ │
│  │  │  │       │             │ │  │               │  │             │   │ │
│  │  │  │LeftRail│ VaultTree │ │  │               │  │             │   │ │
│  │  │  │ (48px)│            │ │  │               │  │             │   │ │
│  │  │  │       │             │ │  │               │  │             │   │ │
│  │  │  └───────┴─────────────┘ │  │               │  │             │   │ │
│  │  │                           │  │               │  │             │   │ │
│  │  └───────────────────────────┘  └───────────────┘  └─────────────┘   │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  StatusBar                                                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Visual Diagram (Top-Down View)

```
俯视图 (Top-Down View):

┌──────────────────────────────────────────────────────────────────────────────┐
│ ● ● ● header-row ← 与 macOS 红绿灯同一行 (pl-16 偏移约 64px)                  │
├────────┬─────────────────────────────────────────┬───────────────────────────┤
│        │                                          │                           │
│        │  content-area                            │  right-column             │
│        │  ┌──────┬──────────────────────────────┐ │                           │
│        │  │      │                              │ │  ┌─────────────────────┐ │
│  LR    │  │ 48px │   VaultTree (left-sidebar)  │ │  │    EditorTabs        │ │
│        │  │      │                              │ │  ├─────────────────────┤ │
│        │  │      │                              │ │  │                     │ │
│        │  │      │                              │ │  │   main-content      │ │
│        │  │      │                              │ │  │   (editor area)     │ │
│        │  └──────┴──────────────────────────────┘ │  │                     │ │
│        │                                          │  │                     │ │
│        │                                          │  └─────────────────────┘ │
│        │                                          │                           │
├────────┴─────────────────────────────────────────┴───────────────────────────┤
│                                    StatusBar                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
app-layout
├── main-area (flex row)
│   ├── left-column (flex col)
│   │   ├── header-row
│   │   │   ├── Search button (when sidebar open)
│   │   │   ├── Collapse button (when sidebar open)
│   │   │   └── Expand button (when sidebar closed)
│   │   └── content-area (flex row)
│   │       ├── LeftRail (w-12)
│   │       └── left-sidebar (flex-1)
│   │           └── VaultTree
│   ├── right-column (flex col)
│   │   ├── EditorTabs
│   │   └── main-content
│   │       └── Outlet (page content)
│   └── SidePanel
└── StatusBar
```

## CSS Classes

| Class           | Description                                | Location                    |
| --------------- | ------------------------------------------ | --------------------------- |
| `.app-layout`   | Root layout container                      | `Layout.tsx`                |
| `.main-area`    | Main horizontal split                      | `Layout.tsx`                |
| `.header-row`   | Header with traffic light offset (`pl-12`) | `Layout.tsx`, `index.css`   |
| `.content-area` | Contains LeftRail + left-sidebar           | `Layout.tsx`, `index.css`   |
| `.left-column`  | Vertical stack of header + content         | `Layout.tsx`, `index.css`   |
| `.right-column` | Vertical stack of tabs + editor            | `Layout.tsx`, `index.css`   |
| `.left-rail`    | Icon navigation (48px width)               | `LeftRail.tsx`, `index.css` |
| `.left-sidebar` | File tree container                        | `Layout.tsx`, `index.css`   |
| `.main-content` | Editor area                                | `Layout.tsx`, `index.css`   |

## Layout Constants

- **Left Rail Width**: 48px
- **Left Sidebar Width**: 256px (w-64)
- **Header Row Height**: ~40px (min-height: 40px)
- **Traffic Light Offset**: `pl-16` (64px, accommodates ~70px for macOS traffic lights)

## Key Design Decisions

1. **Traffic Lights**: With `titleBarStyle: 'hidden'`, macOS traffic lights render in native window chrome. The `header-row` uses `pl-12` to avoid overlapping.

2. **Left Column**: Groups the sidebar header and content area together, ensuring they share the same vertical alignment.

3. **EditorTabs Placement**: Tabs are in the right column alongside the editor, not in the title bar or left sidebar.

4. **Flexbox Layout**: Using flexbox rather than CSS Grid for simplicity and better browser support.
