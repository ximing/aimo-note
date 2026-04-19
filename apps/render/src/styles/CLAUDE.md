# styles/ - Renderer CSS Architecture

This directory contains the renderer's global CSS architecture, organized by concern instead of by page.

Use this file when changing visual styles, layout regions, theme tokens, or editor presentation in `apps/render/src/`.

## Goals

- Keep styles split by responsibility instead of growing `apps/render/src/index.css`.
- Preserve the current app-shell layout and editor surface structure.
- Prefer design tokens and shared classes over one-off inline styling.
- Keep light and dark theme behavior aligned.

## File Map

| File | Purpose |
|------|---------|
| `index.css` | Import entry for the styles architecture inside this directory |
| `variables.css` | Design tokens: colors, spacing, radius, shadows, theme variables |
| `base.css` | Global element defaults, reset-like rules, scrollbars, transitions |
| `layout.css` | App shell layout regions and structural containers |
| `components.css` | Shared UI components and reusable surface patterns |
| `editor-layout.css` | Milkdown / ProseMirror wrapper sizing and flex behavior |
| `editor-content.css` | Editor typography and content-level styling |
| `editor-syntax.css` | Syntax highlighting tokens for code blocks |

## Import Order

In `apps/render/src/main.tsx`:

- `../index.css` loads Tailwind base/components/utilities.
- `./styles/index.css` loads the custom CSS architecture from this directory.

Inside `apps/render/src/styles/index.css`, keep this order:

```css
@import './variables.css';
@import './base.css';
@import './layout.css';
@import './components.css';
@import './editor-layout.css';
@import './editor-content.css';
@import './editor-syntax.css';
```

Do not reorder these imports casually. Tokens should load first, then global rules, then layout/components, then editor-specific styles.

## Placement Rules

When adding or changing styles, use the narrowest correct file:

1. **Theme tokens / reusable values** -> `variables.css`
2. **Global HTML/body/scrollbar/base rules** -> `base.css`
3. **App shell structure / regions / splits / sizing** -> `layout.css`
4. **Reusable UI pieces** -> `components.css`
5. **Editor wrapper sizing / flex / fill-parent behavior** -> `editor-layout.css`
6. **Typography, markdown-like content, editor nodes** -> `editor-content.css`
7. **Code syntax token colors** -> `editor-syntax.css`

Prefer editing an existing file here over adding more global CSS to `apps/render/src/index.css`.

## Theme Tokens

The main tokens live in `variables.css`.

### Current token groups

- **Background layers**: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-quaternary`
- **Text colors**: `--text-primary`, `--text-secondary`, `--text-muted`
- **Accent and surfaces**: `--accent`, `--accent-hover`, `--accent-subtle`, `--hover-soft`, `--surface-soft`, `--selection-soft`
- **Shadows**: `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- **Spacing**: `--space-xs`, `--space-sm`, `--space-md`, `--space-lg`, `--space-xl`
- **Radius**: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`
- **Layout layers**: `--bg-header`, `--bg-rail`, `--bg-sidebar`

### Theme rules

- Light theme tokens live in `:root`.
- Dark theme overrides live under `html.dark`.
- When adding a new color or surface token, usually add both light and dark values.
- Prefer referencing tokens instead of hard-coded colors, except for intentional syntax colors or editor-specific highlighting.

## Layout Conventions

The app shell currently follows this structure:

```text
app-layout
├── main-area
│   ├── left-column
│   │   ├── header-row
│   │   └── content-area
│   │       ├── left-rail
│   │       └── left-sidebar
│   ├── right-column
│   │   ├── editor-tabs-shell
│   │   └── main-content
│   └── side-panel
└── status-bar
```

### Important layout rules

- `header-row` visually shares the macOS traffic-light row.
- Native traffic lights are not in the DOM; spacing for them is handled in the component layer.
- `left-rail` stays fixed at `48px` width.
- `right-column` is the main editor column and must keep `min-width: 0`.
- `left-sidebar` and `side-panel` are resizable regions; avoid CSS changes that break overflow or drag handles.
- `EditorTabs` belong in the right column, not in the title bar.

If you are changing shell structure, also inspect `apps/render/src/components/Layout.tsx` and related architecture docs.

## Component Style Conventions

`components.css` is for reusable UI pieces, not page-specific hacks.

### Current shared patterns

- **Icon buttons**: `.chrome-icon-button`, `.rail-nav-button`, `.tab-close-button`
- **Titlebar action row**: `.titlebar-actions`
- **Editor tabs**: `.editor-tabs-shell`, `.editor-tabs`, `.editor-tab`
- **Editor content surface**: `.editor-surface`
- **File title UI**: `.file-name-header`, `.file-name-input`
- **Tree nodes**: `.tree-node-button`, `.tree-node-button.is-selected`
- **Sidebar popup/menu**: `.sidebar-menu`

### Component rules

- Put shared hover/active/selected behavior here when it applies across pages.
- Prefer semantic class names tied to reusable UI roles.
- Reuse token-based colors and spacing before introducing component-local values.
- Avoid putting shell-region sizing in `components.css`; that belongs in `layout.css`.

## Editor Style Conventions

The editor styles are intentionally split into three layers.

### `editor-layout.css`

Use this file for wrapper and fill-parent behavior:

- `.milkdown-wrapper`
- `.milkdown-wrapper .milkdown`
- intermediate flex containers
- `.ProseMirror` height / width / outline behavior
- optional `.editor-status`

If the editor stops filling available space, this is the first file to inspect.

### `editor-content.css`

Use this file for content rendering inside `.ProseMirror`, including:

- headings, paragraphs, links, inline code
- blockquotes
- ordered / unordered / task lists
- fenced code blocks
- tables, images, horizontal rules
- placeholders, selection, cursor-related presentation

Keep this file focused on document content semantics rather than app-shell layout.

### `editor-syntax.css`

Use this file only for syntax token coloring inside code blocks, such as:

- `.token.keyword`, `.token.tag`
- `.token.string`, `.token.comment`
- `.token.function`, `.token.number`, `.token.operator`
- `.token.punctuation`

Do not mix general code-block box styling into this file; that belongs in `editor-content.css`.

## Naming Conventions

Prefer the current layout naming scheme:

| Old | Current |
|-----|---------|
| `.explorer` | `.left-sidebar` |
| `.explorer-header` | `.left-sidebar-header` |
| `.explorer-content` | `.left-sidebar-content` |

State naming patterns already in use include:

- `.active`
- `.is-selected`
- `.is-empty`

Follow existing naming patterns instead of inventing new modifier styles for the same meaning.

## Working Rules For Changes

- Check whether a style can be expressed with an existing token before adding a new value.
- Prefer extending existing classes over introducing one-off selectors with deep specificity.
- Keep layout rules resilient to resizing and overflow.
- When changing background layering, verify `header-row`, `left-rail`, `left-sidebar`, `right-column`, and `status-bar` still read as one coherent shell.
- When changing editor spacing or typography, verify both light and dark themes.
- If a change affects shell structure, compare against `docs/architecture/layout.md` and `docs/superpowers/specs/2026-04-19-titlebar-layout-design.md`.

## Related Files

- `apps/render/src/main.tsx`
- `apps/render/src/index.css`
- `apps/render/src/components/Layout.tsx`
- `docs/architecture/layout.md`
- `docs/superpowers/specs/2026-04-19-titlebar-layout-design.md`
