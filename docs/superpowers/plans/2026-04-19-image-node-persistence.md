# Image Node Persistence Plan

> **For agentic workers:** Implement this plan with a subagent. Keep edits architecture-aligned and avoid Markdown tail comments or out-of-band persistence.

**Goal:** Persist image alignment and width through normal Milkdown Markdown serialization so image state survives save/reload without hidden comments.

**Architecture:** Replace the current comment-based workaround with a custom Milkdown `image` node extension that owns `align` and `width` attrs, parses both Markdown images and HTML `<img>` nodes, and serializes back to either standard Markdown image syntax or HTML `<img>` when custom attrs are present.

**Tech Stack:** Milkdown v7, ProseMirror schema attrs, custom Milkdown node via `@milkdown/utils` (or the equivalent kit export), renderer-side TypeScript.

---

## Desired Behavior

- Plain images without custom attrs continue to round-trip as normal Markdown image syntax.
- Images with custom `width` and/or non-default `align` round-trip through document saves and reloads.
- Persisted output follows the spec:
  - `width` -> `<img width="...">`
  - `align` -> CSS class and/or DOM attr that can be parsed back into node attrs
- The editor runtime no longer appends `<!-- aimo-image-state ... -->` to Markdown.
- Existing documents that already contain the temporary tail comment remain backward-compatible during migration.

---

## Chunk 1: Replace Comment-Based Persistence With Custom Image Node

**Files:**
- Modify: `apps/render/src/components/editor/MilkdownEditorInner.tsx`
- Create: `apps/render/src/components/editor/extensions/custom-image.ts` (or another editor-local extension file if a better path fits existing conventions)

### Task 1: Define custom image attrs and schema behavior

- [ ] Add a custom image node extension that keeps CommonMark image behavior but extends attrs with:
  - `align?: 'left' | 'center' | 'right'`
  - `width?: number`
- [ ] `parseDOM` should accept:
  - normal `img`
  - `img[width]`
  - `img.align-left|align-center|align-right`
  - `img[data-align]`
- [ ] DOM attrs should normalize values into node attrs.
- [ ] `toDOM` should emit:
  - `class="align-*"` for alignment
  - `data-align` for easier runtime selection/debugging
  - `width` when present

### Task 2: Define Markdown parse/serialize behavior

- [ ] `parseMarkdown` should support:
  - standard mdast `image`
  - HTML `<img>` nodes coming from persisted custom state
- [ ] `toMarkdown` should emit:
  - plain Markdown image syntax when `align` is missing/default center and `width` is absent
  - HTML `<img ...>` when custom attrs are present
- [ ] Preserve `src`, `alt`, and `title`.

### Task 3: Wire the extension into the editor

- [ ] Register the custom image node in `MilkdownEditorInner`.
- [ ] Remove the temporary tail-comment extraction/serialization helpers and hydration flow.
- [ ] Keep the existing runtime image toolbar/resize behavior working on the same `image` node attrs.

---

## Chunk 2: Backward Compatibility and Migration

**Files:**
- Modify: `apps/render/src/components/editor/MilkdownEditorInner.tsx`

### Task 4: Migrate temporary comment-persisted state

- [ ] During load, detect the existing `<!-- aimo-image-state ... -->` payload if present.
- [ ] Before first save, merge that payload into image node attrs so older notes recover state once.
- [ ] After the first successful round-trip save, the note should no longer contain the tail comment.
- [ ] Keep migration logic isolated and removable once old documents are migrated.

---

## Chunk 3: Validation

**Files:**
- Modify tests if present; otherwise validate with typecheck and targeted manual scenarios

### Task 5: Verification checklist

- [ ] Resize an image, save, reload, confirm width persists.
- [ ] Change alignment left/right, save, reload, confirm alignment persists.
- [ ] Insert a plain image without custom attrs, save, confirm it remains normal Markdown image syntax.
- [ ] Open an older note containing `<!-- aimo-image-state ... -->`, save once, confirm state is preserved and comment is removed.
- [ ] Run `pnpm --filter @aimo-note/render typecheck`.

---

## Implementation Notes

- Prefer extracting the custom node into its own file instead of growing `MilkdownEditorInner.tsx` further.
- Do not depend on hidden Markdown comments for persistence after this migration.
- Keep editor runtime behavior driven by node attrs; avoid duplicate React-only state for persisted data.
- Be careful not to break the user's in-progress table context menu changes in `MilkdownEditorInner.tsx`.
