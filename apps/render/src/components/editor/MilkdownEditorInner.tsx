import { useEditor, useInstance } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx, commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark, imageAttr } from '@milkdown/kit/preset/commonmark';
import {
  gfm,
  insertTableCommand,
  addColBeforeCommand,
  addColAfterCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  deleteSelectedCellsCommand,
} from '@milkdown/kit/preset/gfm';
import { isInTable, findTable } from 'prosemirror-tables';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { SlashProvider, slashFactory } from '@milkdown/kit/plugin/slash';
import { NodeSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { Milkdown } from '@milkdown/react';
import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { math } from '@milkdown/plugin-math';
import {
  linkTooltipPlugin,
  configureLinkTooltip,
} from '@milkdown/kit/component/link-tooltip';
import { block } from '@milkdown/kit/plugin/block';
import {
  wrapInHeadingCommand,
  turnIntoTextCommand,
  createCodeBlockCommand,
  insertHrCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
} from '@milkdown/kit/preset/commonmark';
import type { Ctx } from '@milkdown/kit/ctx';
import 'katex/dist/katex.min.css';
import { useImageStorageService } from '../../services/image-storage.service';
import { useVaultService } from '../../services/vault.service';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ImageToolbar } from './ImageToolbar';
import { TableContextMenu } from './TableContextMenu';
import { ImageResizeHandles } from './ImageResizeHandles';

export interface MilkdownEditorInnerProps {
  onChange?: (markdown: string) => void;
  defaultValue?: string;
  className?: string;
  highlightQuery?: string;
  targetLine?: number;
  editorRef?: React.MutableRefObject<{ dom: HTMLElement | null }>;
}

interface ImageOverlayPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PersistedImageState {
  src: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
}

const IMAGE_STATE_COMMENT_RE = /\n?<!--\s*aimo-image-state\s+(\[[\s\S]*?\])\s*-->\s*$/;

const extractPersistedImageState = (markdown: string): { cleanMarkdown: string; imageStates: PersistedImageState[] } => {
  const match = markdown.match(IMAGE_STATE_COMMENT_RE);
  if (!match) {
    return { cleanMarkdown: markdown, imageStates: [] };
  }

  try {
    const parsed = JSON.parse(match[1]) as PersistedImageState[];
    return {
      cleanMarkdown: markdown.replace(IMAGE_STATE_COMMENT_RE, '').trimEnd(),
      imageStates: Array.isArray(parsed) ? parsed : [],
    };
  } catch {
    return { cleanMarkdown: markdown, imageStates: [] };
  }
};

const serializePersistedImageState = (markdown: string, imageStates: PersistedImageState[]): string => {
  const cleanMarkdown = markdown.replace(IMAGE_STATE_COMMENT_RE, '').trimEnd();
  if (imageStates.length === 0) {
    return cleanMarkdown;
  }

  return `${cleanMarkdown}\n\n<!-- aimo-image-state ${JSON.stringify(imageStates)} -->`;
};

// Create slash factory
const slash = slashFactory('Commands');

// Create SlashMenu class to manage the slash menu UI
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
        // Show menu when typing '/'
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
      // Get editor view and delete the '/' character
      const view = this.ctx.get(editorViewCtx);
      const { state } = view;
      const { from } = state.selection;

      // Delete the '/' character (1 character before cursor)
      const deleteTr = state.tr.delete(from - 1, from);
      view.dispatch(deleteTr);

      // Execute the command
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

    // Add hover effect
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
        const index = parseInt(target.dataset.index || '0');
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
  const initialPersistedImageState = useMemo(() => extractPersistedImageState(defaultValue), [defaultValue]);
  const defaultValueRef = useRef(initialPersistedImageState.cleanMarkdown);
  const onChangeRef = useRef(onChange);
  const imageStorageService = useImageStorageService();
  const vaultService = useVaultService();
  const [, getEditor] = useInstance();
  const [pasteError, setPasteError] = useState<string | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(true);
  const pendingScrollTargetRef = useRef<{ line?: number; highlight?: string }>({});
  const pendingImageStateRef = useRef<PersistedImageState[]>(initialPersistedImageState.imageStates);
  const hydratingImageStateRef = useRef(initialPersistedImageState.imageStates.length > 0);

  // Image selection state
  const [selectedImageNodePos, setSelectedImageNodePos] = useState<number | null>(null);
  const [selectedAlignment, setSelectedAlignment] = useState<'left' | 'center' | 'right'>('center');
  const [imagePosition, setImagePosition] = useState<ImageOverlayPosition | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);

  // Table context menu state
  const [tableContextMenu, setTableContextMenu] = useState<{
    x: number;
    y: number;
    canDeleteCol: boolean;
    canDeleteRow: boolean;
  } | null>(null);

  // Keep refs updated without triggering re-render
  useEffect(() => {
    const nextPersistedImageState = extractPersistedImageState(defaultValue);
    defaultValueRef.current = nextPersistedImageState.cleanMarkdown;
    pendingImageStateRef.current = nextPersistedImageState.imageStates;
    hydratingImageStateRef.current = nextPersistedImageState.imageStates.length > 0;
    onChangeRef.current = onChange;
  }, [defaultValue, onChange]);

  const clearSelectedImage = useCallback(() => {
    if (selectedImageRef.current) {
      selectedImageRef.current.classList.remove('is-selected');
    }
    selectedImageRef.current = null;
    setSelectedImageNodePos(null);
    setImagePosition(null);
  }, []);

  const updateImageOverlayPosition = useCallback((imageEl: HTMLImageElement) => {
    const containerRect = editorRootRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const rect = imageEl.getBoundingClientRect();
    setImagePosition({
      top: rect.top - containerRect.top,
      left: rect.left - containerRect.left,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  const resolvePreviewImageUrl = useCallback(
    (src: string) => {
      if (!vaultService.path) return src;
      if (/^(https?:|file:|data:|blob:|aimo-image:)/i.test(src)) {
        return src;
      }

      const normalizedPath = src.replace(/^([./\\])+/, '');
      return `aimo-image://vault?vaultPath=${encodeURIComponent(vaultService.path)}&path=${encodeURIComponent(normalizedPath)}`;
    },
    [vaultService.path]
  );

  const syncRenderedImages = useCallback(() => {
    const editorRoot = editorRootRef.current;
    if (!editorRoot) return;

    editorRoot.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
      const rawSrc = image.getAttribute('src');
      if (!rawSrc) return;

      const resolvedSrc = resolvePreviewImageUrl(rawSrc);
      if (resolvedSrc !== rawSrc) {
        image.setAttribute('src', resolvedSrc);
      }
    });
  }, [resolvePreviewImageUrl]);

  const syncSelectedImageFromView = useCallback(
    (view: EditorView, clickedImage?: HTMLImageElement | null) => {
      const imageNodeType = view.state.schema.nodes.image;
      if (!imageNodeType) {
        clearSelectedImage();
        return;
      }

      let pos: number | null = null;
      let imageEl: HTMLImageElement | null = null;
      let node = null;

      if (view.state.selection instanceof NodeSelection) {
        const selectedNode = view.state.doc.nodeAt(view.state.selection.from);
        if (selectedNode?.type === imageNodeType) {
          pos = view.state.selection.from;
          node = selectedNode;
          const domNode = view.nodeDOM(pos);
          imageEl = domNode instanceof HTMLImageElement
            ? domNode
            : domNode instanceof HTMLElement
              ? domNode.querySelector('img')
              : null;
        }
      }

      if (!node && clickedImage) {
        try {
          const fallbackPos = view.posAtDOM(clickedImage, 0);
          const fallbackNode = view.state.doc.nodeAt(fallbackPos);
          if (fallbackNode?.type === imageNodeType) {
            pos = fallbackPos;
            node = fallbackNode;
            imageEl = clickedImage;
            if (!(view.state.selection instanceof NodeSelection) || view.state.selection.from !== fallbackPos) {
              const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, fallbackPos));
              view.dispatch(tr);
            }
          }
        } catch {
          // Ignore DOM lookup failures and fall back to clearing selection.
        }
      }

      if (pos === null || !node || !imageEl) {
        clearSelectedImage();
        return;
      }

      if (selectedImageRef.current && selectedImageRef.current !== imageEl) {
        selectedImageRef.current.classList.remove('is-selected');
      }

      imageEl.classList.add('is-selected');
      selectedImageRef.current = imageEl;
      setSelectedImageNodePos(pos);
      setSelectedAlignment((node.attrs.align as 'left' | 'center' | 'right') || 'center');
      updateImageOverlayPosition(imageEl);
    },
    [clearSelectedImage, updateImageOverlayPosition]
  );

  const collectPersistedImageState = useCallback((view: EditorView): PersistedImageState[] => {
    const imageStates: PersistedImageState[] = [];

    view.state.doc.descendants((node) => {
      if (node.type.name !== 'image') {
        return undefined;
      }

      const width = typeof node.attrs.width === 'number' ? node.attrs.width : undefined;
      const align = (node.attrs.align as 'left' | 'center' | 'right' | undefined) || 'center';
      if (width === undefined && align === 'center') {
        return undefined;
      }

      imageStates.push({
        src: String(node.attrs.src || ''),
        align,
        width,
      });
      return undefined;
    });

    return imageStates;
  }, []);

  const hydratePersistedImageState = useCallback((view: EditorView) => {
    const pendingStates = pendingImageStateRef.current;
    if (pendingStates.length === 0) {
      hydratingImageStateRef.current = false;
      return;
    }

    const imagePositions: Array<{ pos: number; src: string; attrs: Record<string, unknown> }> = [];
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') {
        imagePositions.push({
          pos,
          src: String(node.attrs.src || ''),
          attrs: node.attrs as Record<string, unknown>,
        });
      }
      return undefined;
    });

    let stateIndex = 0;
    let tr = view.state.tr;
    let changed = false;

    imagePositions.forEach(({ pos, src, attrs }) => {
      const persistedState = pendingStates[stateIndex];
      if (!persistedState || persistedState.src !== src) {
        return;
      }

      stateIndex += 1;
      const nextAttrs = {
        ...attrs,
        align: persistedState.align || attrs.align || 'center',
        width: persistedState.width,
      };

      if (attrs.align !== nextAttrs.align || attrs.width !== nextAttrs.width) {
        tr = tr.setNodeMarkup(pos, undefined, nextAttrs);
        changed = true;
      }
    });

    pendingImageStateRef.current = [];
    hydratingImageStateRef.current = false;

    if (changed) {
      view.dispatch(tr);
    }
  }, []);

  // Create slash menu instance
  const slashMenu = useMemo(() => new SlashMenu(), []);

  // Cleanup slash menu on unmount
  useEffect(() => {
    return () => {
      slashMenu.destroy();
    };
  }, [slashMenu]);

  useEffect(() => {
    const editorRoot = editorRootRef.current;
    if (!editorRoot) return;

    syncRenderedImages();
    const observer = new MutationObserver(() => {
      syncRenderedImages();
    });

    observer.observe(editorRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });

    return () => {
      observer.disconnect();
    };
  }, [syncRenderedImages]);

  const scrollToLineNumber = useCallback((lineNumber: number) => {
    const editor = getEditor();
    if (!editor || lineNumber < 1) return false;

    let didScroll = false;
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const doc = view.state.doc;
      let currentLine = 1;
      let targetPos: number | null = null;

      doc.descendants((node, pos) => {
        if (!node.isTextblock) return undefined;
        if (currentLine === lineNumber) {
          targetPos = pos + 1;
          return false;
        }
        currentLine += 1;
        return undefined;
      });

      if (targetPos == null) return;

      const domNode = view.nodeDOM(targetPos);
      if (domNode instanceof HTMLElement) {
        domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        didScroll = true;
        return;
      }

      const coords = view.coordsAtPos(Math.min(targetPos, view.state.doc.content.size));
      view.dom.ownerDocument.defaultView?.scrollTo({
        top: coords.top,
        behavior: 'smooth',
      });
      didScroll = true;
    });

    return didScroll;
  }, [getEditor]);

  const scrollToFirstHighlight = useCallback(() => {
    const pm = editorRootRef.current?.querySelector('.milkdown .ProseMirror')
      ?? editorRootRef.current?.querySelector('.ProseMirror');
    if (!pm) return false;

    const highlight = pm.querySelector('.search-highlight-editor');
    if (!highlight) return false;

    highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }, []);

  const applyHighlightAndScroll = useCallback(() => {
    const pm = editorRootRef.current?.querySelector('.milkdown .ProseMirror')
      ?? editorRootRef.current?.querySelector('.ProseMirror');
    if (!pm) return false;

    pm.querySelectorAll('.search-highlight-editor').forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });

    const query = highlightQuery?.trim().toLowerCase();
    if (!query) {
      if (typeof targetLine === 'number' && targetLine > 0) {
        return scrollToLineNumber(targetLine);
      }
      return true;
    }

    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT, null);
    const nodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      nodes.push(node);
    }

    nodes.forEach((textNode) => {
      const text = textNode.textContent || '';
      const lowerText = text.toLowerCase();
      let idx = lowerText.indexOf(query);
      if (idx === -1) return;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      while (idx !== -1) {
        if (idx > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)));
        const mark = document.createElement('mark');
        mark.className = 'search-highlight-editor';
        mark.appendChild(document.createTextNode(text.slice(idx, idx + query.length)));
        frag.appendChild(mark);
        lastIdx = idx + query.length;
        idx = lowerText.indexOf(query, lastIdx);
      }
      if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      textNode.parentNode?.replaceChild(frag, textNode);
    });

    if (typeof targetLine === 'number' && targetLine > 0) {
      if (!scrollToLineNumber(targetLine)) {
        scrollToFirstHighlight();
      }
      return true;
    }

    scrollToFirstHighlight();
    return true;
  }, [highlightQuery, scrollToFirstHighlight, scrollToLineNumber, targetLine]);

  // Expose ProseMirror DOM via editorRef and apply search highlight
  useEffect(() => {
    if (!loadingRef.current) {
      if (editorRef) {
        const pm = document.querySelector('.milkdown .ProseMirror') as HTMLElement | null;
        editorRef.current.dom = pm;
      }
    }
  });

  useEffect(() => {
    pendingScrollTargetRef.current = {
      line: targetLine,
      highlight: highlightQuery?.trim() || undefined,
    };
  }, [highlightQuery, targetLine]);

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();

        try {
          const url = await imageStorageService.uploadFromClipboard();
          if (url) {
            const editor = getEditor();
            if (editor) {
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
            }
          }
        } catch (error) {
          console.error('[Editor] Image paste failed:', error);
          setPasteError(error instanceof Error ? error.message : String(error));
        }
        return;
      }
    }
  };

  // Handle alignment change from toolbar
  const handleAlignmentChange = useCallback(
    (align: 'left' | 'center' | 'right') => {
      setSelectedAlignment(align);

      const editor = getEditor();
      if (!editor || selectedImageNodePos === null) return;

      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state, dispatch } = view;

        const node = state.doc.nodeAt(selectedImageNodePos);
        if (!node) return;

        const tr = state.tr.setNodeMarkup(selectedImageNodePos, undefined, {
          ...node.attrs,
          align,
        });
        dispatch(tr);
        window.requestAnimationFrame(() => syncSelectedImageFromView(view));
      });
    },
    [getEditor, selectedImageNodePos, syncSelectedImageFromView]
  );

  // Handle delete image
  const handleDeleteImage = useCallback(() => {
    const editor = getEditor();
    if (!editor || selectedImageNodePos === null) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state, dispatch } = view;

      const node = state.doc.nodeAt(selectedImageNodePos);
      if (!node) return;

      const tr = state.tr.delete(selectedImageNodePos, selectedImageNodePos + node.nodeSize);
      dispatch(tr);
      clearSelectedImage();
    });
  }, [clearSelectedImage, getEditor, selectedImageNodePos]);

  const handleResize = useCallback(() => {
    if (!selectedImageRef.current) return;
    updateImageOverlayPosition(selectedImageRef.current);
  }, [updateImageOverlayPosition]);

  // Handle resize end - update node width attribute
  const handleResizeEnd = useCallback(
    (width: number) => {
      const editor = getEditor();
      if (!editor || selectedImageNodePos === null) return;

      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state, dispatch } = view;

        const node = state.doc.nodeAt(selectedImageNodePos);
        if (!node) return;

        const tr = state.tr.setNodeMarkup(selectedImageNodePos, undefined, {
          ...node.attrs,
          width,
        });
        dispatch(tr);
        window.requestAnimationFrame(() => syncSelectedImageFromView(view));
      });
    },
    [getEditor, selectedImageNodePos, syncSelectedImageFromView]
  );

  // Recalculate toolbar position on window resize and container scroll
  const handleRecalcImagePosition = useCallback(() => {
    if (selectedImageNodePos === null || !selectedImageRef.current) return;
    updateImageOverlayPosition(selectedImageRef.current);
  }, [selectedImageNodePos, updateImageOverlayPosition]);

  // Table context menu handlers
  const handleTableContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    const editor = getEditor();
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state } = view;
      if (!isInTable(state)) return;

      const $pos = state.doc.resolve(state.selection.from);
      const tableInfo = findTable($pos);
      if (!tableInfo) return;

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
    window.addEventListener('resize', handleRecalcImagePosition);
    const editorEl = editorRootRef.current;
    editorEl?.addEventListener('scroll', handleRecalcImagePosition);

    return () => {
      window.removeEventListener('resize', handleRecalcImagePosition);
      editorEl?.removeEventListener('scroll', handleRecalcImagePosition);
    };
  }, [handleRecalcImagePosition]);

  const { loading } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, defaultValueRef.current);

        // Configure image attributes (align and width) for DOM rendering.
        ctx.set(imageAttr.key, (node) => {
          const align = node.attrs.align as 'left' | 'center' | 'right' | undefined;
          const width = node.attrs.width as number | undefined;
          return {
            class: align ? `align-${align}` : undefined,
            'data-align': align || 'center',
            width: width || undefined,
          };
        });

        // Configure link tooltip
        configureLinkTooltip(ctx);

        // Configure slash menu
        slashMenu.setCtx(ctx);
        ctx.set(slash.key, {
          view: () => ({
            update: slashMenu.update,
            destroy: slashMenu.destroy,
          }),
        });

        if (onChangeRef.current) {
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            if (hydratingImageStateRef.current) {
              return;
            }

            const view = _ctx.get(editorViewCtx);
            const persistedMarkdown = serializePersistedImageState(markdown, collectPersistedImageState(view));
            onChangeRef.current?.(persistedMarkdown);
          });
        }
      })
      .use(commonmark) // Base markdown schema (required for gfm)
      .use(gfm) // GFM: tables, strikethrough, task lists
      .use(history)
      .use(listener)
      .use(slash) // Slash command menu
      .use(math) // LaTeX math support
      .use(linkTooltipPlugin) // Link tooltip UI
      .use(block); // Block drag handle
  }, []);

  useEffect(() => {
    if (loading) {
      loadingRef.current = true;
      clearSelectedImage();
      return;
    }

    loadingRef.current = false;

    const editor = getEditor();
    if (!editor) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      hydratePersistedImageState(view);
    });
  }, [clearSelectedImage, getEditor, hydratePersistedImageState, loading]);

  useEffect(() => {
    if (loading) return;

    const editor = getEditor();
    if (!editor) return;

    return editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
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

  // Attach contextmenu listener for table context menu
  useEffect(() => {
    if (loading) return;

    const editor = getEditor();
    if (!editor) return;

    return editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const prosemirror = view.dom.querySelector('.ProseMirror') as HTMLElement | null;
      if (!prosemirror) return;

      const handler = (e: MouseEvent) => {
        handleTableContextMenu(e);
      };

      prosemirror.addEventListener('contextmenu', handler);
      return () => prosemirror.removeEventListener('contextmenu', handler);
    });
  }, [loading, getEditor, handleTableContextMenu]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!pendingScrollTargetRef.current.line && !pendingScrollTargetRef.current.highlight) {
      return;
    }

    const timeout = window.setTimeout(() => {
      if (!applyHighlightAndScroll()) {
        window.setTimeout(() => {
          applyHighlightAndScroll();
        }, 150);
      }
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [applyHighlightAndScroll, loading]);

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
