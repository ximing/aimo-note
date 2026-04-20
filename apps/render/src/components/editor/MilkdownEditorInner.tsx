import { useEditor, useInstance, Milkdown } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx, commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import {
  imageAttr,
  wrapInHeadingCommand,
  turnIntoTextCommand,
  createCodeBlockCommand,
  insertHrCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  schema as commonmarkSchema,
  inputRules as commonmarkInputRules,
  markInputRules as commonmarkMarkInputRules,
  commands as commonmarkCommands,
  keymap as commonmarkKeymap,
  plugins as commonmarkPlugins,
} from '@milkdown/kit/preset/commonmark';
import { gfm, insertTableCommand } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { SlashProvider, slashFactory } from '@milkdown/kit/plugin/slash';
import type { EditorView } from '@milkdown/kit/prose/view';
import { useRef, useEffect, useMemo, useState } from 'react';
import { math } from '@milkdown/plugin-math';
import { linkTooltipPlugin, configureLinkTooltip } from '@milkdown/kit/component/link-tooltip';
import { block } from '@milkdown/kit/plugin/block';
import type { Ctx } from '@milkdown/kit/ctx';
import 'katex/dist/katex.min.css';
import { useImageStorageService } from '../../services/image-storage.service';
import { useVaultService } from '../../services/vault.service';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ImageToolbar } from './ImageToolbar';
import { TableContextMenu } from './TableContextMenu';
import { ImageResizeHandles } from './ImageResizeHandles';
import { customImageSchema, migrateImageStateComment } from './extensions/custom-image';
import { useImageEditing } from './image/use-image-editing';
import { migrateHtmlImageNodes } from './image/migrate-html-image-nodes';
import { useHighlightScroll } from './hooks/use-highlight-scroll';
import { useTableContextMenu } from './hooks/use-table-context-menu';

export interface MilkdownEditorInnerProps {
  onChange?: (markdown: string) => void;
  defaultValue?: string;
  className?: string;
  highlightQuery?: string;
  targetLine?: number;
  editorRef?: React.MutableRefObject<{ dom: HTMLElement | null }>;
}

const commonmarkWithCustomImage = [
  ...commonmarkSchema,
  customImageSchema,
  commonmarkInputRules,
  commonmarkMarkInputRules,
  commonmarkCommands,
  commonmarkKeymap,
  commonmarkPlugins,
].flat();

const slash = slashFactory('Commands');

type SlashMenuItem = {
  label: string;
  icon: string;
  commandKey:
    | typeof wrapInHeadingCommand.key
    | typeof turnIntoTextCommand.key
    | typeof wrapInBulletListCommand.key
    | typeof wrapInOrderedListCommand.key
    | typeof wrapInBlockquoteCommand.key
    | typeof createCodeBlockCommand.key
    | typeof insertHrCommand.key
    | typeof insertTableCommand.key;
  payload?: number | { row: number; col: number };
};

class SlashMenu {
  private element: HTMLDivElement;
  private provider: SlashProvider;
  private ctx: Ctx | null = null;
  private items: SlashMenuItem[] = [];

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'slash-menu';
    this.provider = new SlashProvider({
      content: this.element,
      offset: 8,
      shouldShow: (view: EditorView) => {
        const content = this.provider.getContent(view);
        if (!content) {
          this.hide();
          return false;
        }
        const shouldShow = content.endsWith('/');
        if (shouldShow) {
          this.show();
        } else {
          this.hide();
        }
        return shouldShow;
      },
    });
    this.setupItems();
    this.render();
  }

  private setupItems() {
    this.items = [
      { label: 'Heading 1', icon: 'H1', commandKey: wrapInHeadingCommand.key, payload: 1 },
      { label: 'Heading 2', icon: 'H2', commandKey: wrapInHeadingCommand.key, payload: 2 },
      { label: 'Heading 3', icon: 'H3', commandKey: wrapInHeadingCommand.key, payload: 3 },
      { label: 'Paragraph', icon: 'P', commandKey: turnIntoTextCommand.key },
      { label: 'Bullet List', icon: '•', commandKey: wrapInBulletListCommand.key },
      { label: 'Numbered List', icon: '1.', commandKey: wrapInOrderedListCommand.key },
      { label: 'Quote', icon: '"', commandKey: wrapInBlockquoteCommand.key },
      { label: 'Code Block', icon: '</>', commandKey: createCodeBlockCommand.key },
      { label: 'Table', icon: '3x3', commandKey: insertTableCommand.key, payload: { row: 3, col: 3 } },
      { label: 'Divider', icon: '—', commandKey: insertHrCommand.key },
    ];
  }

  private executeCommand(index: number) {
    if (!this.ctx) return;
    const item = this.items[index];
    if (!item) return;

    try {
      const view = this.ctx.get(editorViewCtx);
      const { state } = view;
      const { from } = state.selection;
      const deleteTr = state.tr.delete(from - 1, from);
      view.dispatch(deleteTr);

      const commands = this.ctx.get(commandsCtx);
      commands.call(item.commandKey, item.payload);
    } catch (error) {
      console.error('Failed to execute command:', error);
    }
    this.hide();
  }

  private render() {
    this.element.innerHTML = this.items
      .map(
        (item, i) => `
        <div class="slash-menu-item" data-index="${i}">
          <span class="slash-menu-item-icon">${item.icon}</span>
          <span class="slash-menu-item-label">${item.label}</span>
        </div>
      `
      )
      .join('');

    this.element.querySelectorAll('.slash-menu-item').forEach((el) => {
      el.addEventListener('mouseenter', (e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.background = '#f3f4f6';
      });
      el.addEventListener('mouseleave', (e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.background = 'transparent';
      });
      el.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const index = parseInt(target.dataset.index || '0', 10);
        this.executeCommand(index);
      });
    });
  }

  setCtx(ctx: Ctx) {
    this.ctx = ctx;
  }

  update = (view: EditorView) => {
    return this.provider.update(view);
  };

  destroy = () => {
    this.provider.destroy();
    this.element.innerHTML = '';
    this.element.remove();
  };

  show() {
    this.element.style.display = 'block';
  }

  hide() {
    this.element.style.display = 'none';
  }
}

export function MilkdownEditorInner({
  onChange,
  defaultValue = '# New Note',
  className = '',
  highlightQuery,
  targetLine,
  editorRef,
}: MilkdownEditorInnerProps) {
  const initialMarkdown = useMemo(() => migrateImageStateComment(defaultValue), [defaultValue]);
  const defaultValueRef = useRef(initialMarkdown);
  const onChangeRef = useRef(onChange);
  const imageStorageService = useImageStorageService();
  const vaultService = useVaultService();
  const [, getEditor] = useInstance();
  const [pasteError, setPasteError] = useState<string | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(true);

  const slashMenu = useMemo(() => new SlashMenu(), []);

  useEffect(() => {
    defaultValueRef.current = migrateImageStateComment(defaultValue);
    onChangeRef.current = onChange;
  }, [defaultValue, onChange]);

  useEffect(() => {
    return () => {
      slashMenu.destroy();
    };
  }, [slashMenu]);

  const { loading } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, defaultValueRef.current);

        ctx.set(imageAttr.key, (node) => {
          const align = node.attrs.align as 'left' | 'center' | 'right' | undefined;
          const width = node.attrs.width as number | undefined;
          return {
            class: align ? `align-${align}` : undefined,
            'data-align': align || 'center',
            width: width || undefined,
            style: width ? `width: ${width}px` : undefined,
          };
        });

        configureLinkTooltip(ctx);

        slashMenu.setCtx(ctx);
        ctx.set(slash.key, {
          view: () => ({
            update: slashMenu.update,
            destroy: slashMenu.destroy,
          }),
        });

        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          if (import.meta.env.DEV) {
            console.log('[ImagePersistDebug] listener markdownUpdated emit', {
              markdownLength: markdown.length,
              containsHtmlImg: markdown.includes('<img '),
              containsWidthStyle: markdown.includes('width:'),
            });
          }
          onChangeRef.current?.(markdown);
        });
      })
      .use(commonmarkWithCustomImage)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(slash)
      .use(math)
      .use(linkTooltipPlugin)
      .use(block);
  }, []);

  const {
    selectedImageNodePos,
    selectedAlignment,
    imagePosition,
    selectedImageRef,
    clearSelectedImage,
    syncSelectedImageFromView,
    handleAlignmentChange,
    handleDeleteImage,
    handleResize,
    handleResizeEnd,
  } = useImageEditing({
    getEditor,
    editorRootRef,
    vaultPath: vaultService.path,
  });

  const {
    tableContextMenu,
    closeTableContextMenu,
    insertColLeft,
    insertColRight,
    insertRowUp,
    insertRowDown,
    deleteCol,
    deleteRow,
  } = useTableContextMenu({
    getEditor,
    loading,
  });

  useHighlightScroll({
    getEditor,
    editorRootRef,
    loading,
    highlightQuery,
    targetLine,
  });

  useEffect(() => {
    if (loading) {
      loadingRef.current = true;
      clearSelectedImage();
      return;
    }

    loadingRef.current = false;
  }, [clearSelectedImage, loading]);

  useEffect(() => {
    if (loading) return;

    const editor = getEditor();
    if (!editor) return;

    return editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const convertedCount = migrateHtmlImageNodes(ctx);
      if (import.meta.env.DEV && convertedCount > 0) {
        console.log('[ImagePersistDebug] converted html img nodes on load', { convertedCount });
      }

      const syncSelection = (clickedImage?: HTMLImageElement | null) => {
        window.requestAnimationFrame(() => {
          syncSelectedImageFromView(view, clickedImage);
        });
      };

      const handleDocumentPointerDown = (event: PointerEvent) => {
        const target = event.target;
        const editorRoot = editorRootRef.current;
        if (!(target instanceof Node) || !editorRoot) return;

        if (!editorRoot.contains(target)) {
          clearSelectedImage();
          return;
        }

        const clickedImage = target instanceof Element ? target.closest('img') : null;
        syncSelection(clickedImage instanceof HTMLImageElement ? clickedImage : null);
      };

      const handleMouseUp = () => syncSelection();
      const handleKeyUp = () => syncSelection();

      view.dom.addEventListener('mouseup', handleMouseUp);
      view.dom.addEventListener('keyup', handleKeyUp);
      document.addEventListener('pointerdown', handleDocumentPointerDown, true);
      syncSelection();

      return () => {
        view.dom.removeEventListener('mouseup', handleMouseUp);
        view.dom.removeEventListener('keyup', handleKeyUp);
        document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
      };
    });
  }, [clearSelectedImage, getEditor, loading, syncSelectedImageFromView]);

  useEffect(() => {
    if (loadingRef.current || !editorRef) {
      return;
    }

    const editor = getEditor();
    if (!editor) {
      editorRef.current.dom = null;
      return;
    }

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      editorRef.current.dom = view.dom instanceof HTMLElement ? view.dom : null;
    });
  });

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue;

      event.preventDefault();
      try {
        const url = await imageStorageService.uploadFromClipboard();
        if (!url) return;

        const editor = getEditor();
        if (!editor) return;

        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state, dispatch } = view;
          const imageNodeType = state.schema.nodes.image;
          if (!imageNodeType) {
            console.error('[Editor] Image node type not found in schema');
            return;
          }

          const altText = url.split('/').pop() || 'image';
          const imageNode = imageNodeType.create({ src: url, alt: altText, title: '' });
          const tr = state.tr.replaceSelectionWith(imageNode).scrollIntoView();
          dispatch(tr);
        });
      } catch (error) {
        console.error('[Editor] Image paste failed:', error);
        setPasteError(error instanceof Error ? error.message : String(error));
      }
      return;
    }
  };

  return (
    <>
      <div
        ref={editorRootRef}
        className={`milkdown-wrapper h-full flex flex-col ${className}`}
        onPaste={handlePaste}
      >
        {loading && (
          <div className="milkdown-loading p-4 text-gray-500">Loading editor...</div>
        )}
        <div className="milkdown h-full flex flex-col">
          <Milkdown />
        </div>

        {selectedImageNodePos !== null && imagePosition && (
          <>
            <ImageToolbar
              alignment={selectedAlignment}
              position={imagePosition}
              onAlign={handleAlignmentChange}
              onDelete={handleDeleteImage}
              containerRef={editorRootRef as React.RefObject<HTMLElement>}
            />
            <ImageResizeHandles
              imageRef={selectedImageRef as React.RefObject<HTMLImageElement>}
              position={imagePosition}
              onResizeStart={handleResize}
              onResize={handleResize}
              onResizeEnd={handleResizeEnd}
            />
          </>
        )}

        {tableContextMenu && (
          <TableContextMenu
            x={tableContextMenu.x}
            y={tableContextMenu.y}
            canDeleteCol={tableContextMenu.canDeleteCol}
            canDeleteRow={tableContextMenu.canDeleteRow}
            onClose={closeTableContextMenu}
            onInsertColLeft={insertColLeft}
            onInsertColRight={insertColRight}
            onInsertRowUp={insertRowUp}
            onInsertRowDown={insertRowDown}
            onDeleteCol={deleteCol}
            onDeleteRow={deleteRow}
          />
        )}
      </div>

      {pasteError && (
        <ConfirmDialog
          title="图片粘贴失败"
          message={pasteError}
          confirmText="知道了"
          hideCancel
          onConfirm={() => setPasteError(null)}
          onCancel={() => setPasteError(null)}
        />
      )}
    </>
  );
}
