import { useCallback, useEffect, useState } from 'react';
import type { Editor as MilkdownEditor } from '@milkdown/kit/core';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
  deleteSelectedCellsCommand,
} from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/kit/prose/state';
import { findTable } from 'prosemirror-tables';

export interface TableContextMenuState {
  x: number;
  y: number;
  canDeleteCol: boolean;
  canDeleteRow: boolean;
}

interface UseTableContextMenuParams {
  getEditor: () => MilkdownEditor | undefined;
  loading: boolean;
}

export interface UseTableContextMenuResult {
  tableContextMenu: TableContextMenuState | null;
  closeTableContextMenu: () => void;
  insertColLeft: () => void;
  insertColRight: () => void;
  insertRowUp: () => void;
  insertRowDown: () => void;
  deleteCol: () => void;
  deleteRow: () => void;
}

export const useTableContextMenu = ({ getEditor, loading }: UseTableContextMenuParams): UseTableContextMenuResult => {
  const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);

  const handleTableContextMenu = useCallback((e: MouseEvent) => {
    const target = e.target;
    if (!(target instanceof Element) || !target.closest('td, th')) {
      setTableContextMenu(null);
      return;
    }

    const editor = getEditor();
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const posAtCoords = view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!posAtCoords) {
        setTableContextMenu(null);
        return;
      }

      const resolvedPos = posAtCoords.inside >= 0 ? posAtCoords.inside : posAtCoords.pos;
      const $pos = view.state.doc.resolve(resolvedPos);
      const tableInfo = findTable($pos);
      if (!tableInfo) {
        setTableContextMenu(null);
        return;
      }

      e.preventDefault();

      const nextSelection = TextSelection.near($pos);
      if (!nextSelection.eq(view.state.selection)) {
        view.dispatch(view.state.tr.setSelection(nextSelection));
      }

      const rowCount = tableInfo.node.childCount;
      const colCount = tableInfo.node.firstChild?.childCount || 0;

      setTableContextMenu({
        x: e.clientX,
        y: e.clientY,
        canDeleteCol: colCount > 1,
        canDeleteRow: rowCount > 1,
      });
    });
  }, [getEditor]);

  const closeTableContextMenu = useCallback(() => {
    setTableContextMenu(null);
  }, []);

  const insertColLeft = useCallback(() => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(addColBeforeCommand.key);
    });
  }, [getEditor]);

  const insertColRight = useCallback(() => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(addColAfterCommand.key);
    });
  }, [getEditor]);

  const insertRowUp = useCallback(() => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(addRowBeforeCommand.key);
    });
  }, [getEditor]);

  const insertRowDown = useCallback(() => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(addRowAfterCommand.key);
    });
  }, [getEditor]);

  const deleteCol = useCallback(() => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(deleteSelectedCellsCommand.key);
    });
  }, [getEditor]);

  const deleteRow = useCallback(() => {
    const editor = getEditor();
    if (!editor) return;
    editor.action((ctx) => {
      const commands = ctx.get(commandsCtx);
      commands.call(deleteSelectedCellsCommand.key);
    });
  }, [getEditor]);

  useEffect(() => {
    if (loading) return;

    const editor = getEditor();
    if (!editor) return;

    return editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const prosemirror = view.dom instanceof HTMLElement ? view.dom : null;
      if (!prosemirror) return;

      const handler = (event: MouseEvent) => {
        handleTableContextMenu(event);
      };

      prosemirror.addEventListener('contextmenu', handler);
      return () => prosemirror.removeEventListener('contextmenu', handler);
    });
  }, [getEditor, handleTableContextMenu, loading]);

  return {
    tableContextMenu,
    closeTableContextMenu,
    insertColLeft,
    insertColRight,
    insertRowUp,
    insertRowDown,
    deleteCol,
    deleteRow,
  };
};
