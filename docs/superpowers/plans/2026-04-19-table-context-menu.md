# Table Context Menu Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add right-click context menu for table cells supporting insert/delete row/column operations

**Architecture:** Use Milkdown GFM preset commands to manipulate tables, with floating menu triggered on right-click within table cells. Track cell selection state via ProseMirror's `findCell` utility.

**Tech Stack:** React 19, Milkdown GFM, Tailwind CSS, @rabjs/react

---

## File Structure

| File                                                        | Action | Responsibility                                                          |
| ----------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `apps/render/src/components/editor/TableContextMenu.tsx`    | Create | Floating context menu UI                                                |
| `apps/render/src/components/editor/MilkdownEditorInner.tsx` | Modify | Import commands, add selection state, contextmenu listener, render menu |
| `apps/render/src/components/common/index.ts`                | Modify | Export TableContextMenu                                                 |
| `apps/render/src/styles/components.css`                     | Modify | Table context menu styles                                               |

---

## Chunk 1: TableContextMenu Component

### Task 1: Create TableContextMenu.tsx

**Files:**

- Create: `apps/render/src/components/editor/TableContextMenu.tsx`

- [ ] **Step 1: Write the component file**

```tsx
import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

export interface TableContextMenuProps {
  x: number;
  y: number;
  canDeleteCol: boolean;
  canDeleteRow: boolean;
  onClose: () => void;
  onInsertColLeft: () => void;
  onInsertColRight: () => void;
  onInsertRowUp: () => void;
  onInsertRowDown: () => void;
  onDeleteCol: () => void;
  onDeleteRow: () => void;
}

const MENU_MIN_WIDTH = 168;
const MENU_ESTIMATED_HEIGHT = 280;
const PADDING = 8;

export function TableContextMenu({
  x,
  y,
  canDeleteCol,
  canDeleteRow,
  onClose,
  onInsertColLeft,
  onInsertColRight,
  onInsertRowUp,
  onInsertRowDown,
  onDeleteCol,
  onDeleteRow,
}: TableContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  let adjustedX = x;
  if (x + MENU_MIN_WIDTH > window.innerWidth - PADDING) {
    adjustedX = window.innerWidth - MENU_MIN_WIDTH - PADDING;
  }

  let adjustedY = y;
  const spaceBelow = window.innerHeight - y;
  const spaceAbove = y;
  if (spaceBelow < MENU_ESTIMATED_HEIGHT && spaceAbove > spaceBelow) {
    adjustedY = y - MENU_ESTIMATED_HEIGHT;
  }
  if (adjustedY + MENU_ESTIMATED_HEIGHT > window.innerHeight - PADDING) {
    adjustedY = window.innerHeight - MENU_ESTIMATED_HEIGHT - PADDING;
  }
  adjustedY = Math.max(PADDING, adjustedY);

  const renderMenuItem = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled: boolean = false,
    danger: boolean = false
  ) => (
    <button
      type="button"
      onClick={
        disabled
          ? undefined
          : () => {
              onClick();
              onClose();
            }
      }
      disabled={disabled}
      className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent hover:text-white transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${danger ? 'text-destructive' : 'text-text-primary'}`}
    >
      <span className="w-4">{icon}</span>
      {label}
    </button>
  );

  return (
    <div
      ref={menuRef}
      className="table-context-menu absolute z-50 min-w-[168px] bg-bg-primary border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.2)] py-1"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {renderMenuItem('向左插入列', <ArrowLeft size={14} />, onInsertColLeft)}
      {renderMenuItem('向右插入列', <ArrowRight size={14} />, onInsertColRight)}
      {renderMenuItem('向上插入行', <ArrowUp size={14} />, onInsertRowUp)}
      {renderMenuItem('向下插入行', <ArrowDown size={14} />, onInsertRowDown)}
      <div className="h-px bg-border mx-2 my-1" />
      {renderMenuItem('删除当前列', <Trash2 size={14} />, onDeleteCol, !canDeleteCol, true)}
      {renderMenuItem('删除当前行', <Trash2 size={14} />, onDeleteRow, !canDeleteRow, true)}
    </div>
  );
}
```

- [ ] **Step 2: Update component index export**

File: `apps/render/src/components/editor/index.ts`

Add to exports:

```typescript
export { TableContextMenu } from './TableContextMenu';
export type { TableContextMenuProps } from './TableContextMenu';
```

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/components/editor/TableContextMenu.tsx apps/render/src/components/editor/index.ts
git commit -m "feat(editor): add TableContextMenu component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: Integrate Table Context Menu into MilkdownEditorInner

### Task 2: Modify MilkdownEditorInner.tsx

**Files:**

- Modify: `apps/render/src/components/editor/MilkdownEditorInner.tsx`
- Modify: `apps/render/src/styles/components.css`

#### Step A: Update imports

After existing imports, add:

```typescript
import {
  addColBeforeCommand,
  addColAfterCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  deleteSelectedCellsCommand,
} from '@milkdown/kit/preset/gfm';
import { isInTable, findCell, selectedRect, cellAround } from 'prosemirror-tables';
import { TableContextMenu } from './TableContextMenu';
```

#### Step B: Add interface for table context menu state

After `ImageOverlayPosition` interface:

```typescript
interface TableContextMenuState {
  x: number;
  y: number;
  canDeleteCol: boolean;
  canDeleteRow: boolean;
}
```

#### Step C: Add state and ref in MilkdownEditorInner function component

After image selection state:

```typescript
const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);
```

#### Step D: Add table context menu handler

Add these methods inside the class or as callbacks:

```typescript
// Table context menu handler
private handleTableContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  const { state } = this.editor.view;
  if (!isInTable(state)) return;

  // Find the cell at click position
  const $pos = state.doc.resolve(state.selection.from);
  const cell = cellAround($pos) || findCell($pos);
  if (!cell) return;

  // Get table rect to check row/col count
  const rect = selectedRect(state);
  const canDeleteCol = rect.width > 1 || rect.map.width > 1;
  const canDeleteRow = rect.height > 1 || rect.map.height > 1;

  setTableContextMenu({ x: e.clientX, y: e.clientY, canDeleteCol, canDeleteRow });
};
```

Note: `canDeleteCol` and `canDeleteRow` logic needs refinement — use `rect.map.width > 1` to detect if there's more than one column in the table.

#### Step E: Add useEffect to attach contextmenu listener

```typescript
useEffect(
  () => {
    const editorDom = editorRef.current?.querySelector('.ProseMirror');
    if (!editorDom) return;

    const handler = (e: MouseEvent) => {
      const state = editorViewRef.current?.state;
      if (state && isInTable(state)) {
        handleTableContextMenu(e);
      }
    };

    editorDom.addEventListener('contextmenu', handler);
    return () => editorDom.removeEventListener('contextmenu', handler);
  },
  [
    /* deps */
  ]
);
```

#### Step F: Add table command handlers

```typescript
private insertColLeft = () => {
  const ctx = this.ctx;
  const commands = ctx.get(commandsCtx);
  commands.call(addColBeforeCommand.key);
};

private insertColRight = () => {
  const ctx = this.ctx;
  const commands = ctx.get(commandsCtx);
  commands.call(addColAfterCommand.key);
};

private insertRowUp = () => {
  const ctx = this.ctx;
  const commands = ctx.get(commandsCtx);
  commands.call(addRowBeforeCommand.key);
};

private insertRowDown = () => {
  const ctx = this.ctx;
  const commands = ctx.get(commandsCtx);
  commands.call(addRowAfterCommand.key);
};

private deleteCol = () => {
  const ctx = this.ctx;
  const commands = ctx.get(commandsCtx);
  commands.call(deleteSelectedCellsCommand.key);
};

private deleteRow = () => {
  const ctx = this.ctx;
  const commands = ctx.get(commandsCtx);
  commands.call(deleteSelectedCellsCommand.key);
};
```

#### Step G: Render TableContextMenu in JSX

Add conditional render before ImageToolbar:

```tsx
{
  tableContextMenu && (
    <TableContextMenu
      x={tableContextMenu.x}
      y={tableContextMenu.y}
      canDeleteCol={tableContextMenu.canDeleteCol}
      canDeleteRow={tableContextMenu.canDeleteRow}
      onClose={() => setTableContextMenu(null)}
      onInsertColLeft={this.insertColLeft}
      onInsertColRight={this.insertColRight}
      onInsertRowUp={this.insertRowUp}
      onInsertRowDown={this.insertRowDown}
      onDeleteCol={this.deleteCol}
      onDeleteRow={this.deleteRow}
    />
  );
}
```

#### Step H: Fix the canDelete logic

The `canDeleteCol` / `canDeleteRow` detection needs to check the actual table structure:

```typescript
// In handleTableContextMenu:
const rect = selectedRect(state);
// A column can be deleted if there are multiple columns
const canDeleteCol = rect.map.width > 1;
// A row can be deleted if there are multiple rows
const canDeleteRow = rect.map.height > 1;
```

Note: The `selectedRect` helper requires the selection to actually be a CellSelection. For a single-cell click, we need to use the table map directly.

Alternative approach using `findTable`:

```typescript
private handleTableContextMenu = (e: MouseEvent) => {
  e.preventDefault();
  const { state } = this.editor.view;
  if (!isInTable(state)) return;

  const $pos = state.doc.resolve(state.selection.from);
  const tableInfo = findCell($pos);
  if (!tableInfo) return;

  // Get table node to check dimensions
  const tableNode = findTable($pos);
  if (!tableNode) return;

  // Table row count = tableNode.node.childCount
  // Column count from first row's child count
  const rowCount = tableNode.node.childCount;
  const colCount = tableNode.node.firstChild?.childCount || 0;

  setTableContextMenu({
    x: e.clientX,
    y: e.clientY,
    canDeleteCol: colCount > 1,
    canDeleteRow: rowCount > 1,
  });
};
```

Import `findTable` from `prosemirror-tables`.

#### Step I: Clean up table context menu on editor blur

Add `setTableContextMenu(null)` call in the blur/click handler that clears other selection states.

---

## Verification

1. Run `pnpm --filter @aimo-note/render dev`
2. Create or open a note with a table
3. Click inside a table cell — should see `.selectedCell` highlight
4. Right-click the cell — context menu should appear
5. Test each menu item:
   - Insert column left/right: new column should appear
   - Insert row above/below: new row should appear
   - Delete column (when >1 col): column should be removed
   - Delete row (when >1 row): row should be removed
6. When table has only 1 column, "Delete Column" should be disabled
7. When table has only 1 row, "Delete Row" should be disabled
8. Click outside menu or press Escape should close menu
9. Menu should not go off-screen

---

## Risks & Mitigations

| Risk                                              | Mitigation                                    |
| ------------------------------------------------- | --------------------------------------------- |
| `selectedRect` fails when no CellSelection exists | Use `findTable` to get table node directly    |
| Commands fail outside table context               | `isInTable` guard in handler                  |
| Menu appears on non-table right-click             | Only show when `isInTable(state)` is true     |
| Image selection conflicts                         | Separate state, separate rendering conditions |
