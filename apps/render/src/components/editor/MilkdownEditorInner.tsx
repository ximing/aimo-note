import { useEditor, useInstance } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx, commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark, imageAttr } from '@milkdown/kit/preset/commonmark';
import { gfm, insertTableCommand } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { SlashProvider, slashFactory } from '@milkdown/kit/plugin/slash';
import type { EditorView } from '@milkdown/kit/prose/view';
import { Milkdown } from '@milkdown/react';
import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { math } from '@milkdown/plugin-math';
import {
  imageBlockComponent,
  imageBlockConfig,
} from '@milkdown/kit/component/image-block';
import {
  imageInlineComponent,
} from '@milkdown/kit/component/image-inline';
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
import { ImageResizeHandles } from './ImageResizeHandles';

export interface MilkdownEditorInnerProps {
  onChange?: (markdown: string) => void;
  defaultValue?: string;
  className?: string;
  highlightQuery?: string;
  targetLine?: number;
  editorRef?: React.MutableRefObject<{ dom: HTMLElement | null }>;
}

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
  const defaultValueRef = useRef(defaultValue);
  const onChangeRef = useRef(onChange);
  const imageStorageService = useImageStorageService();
  const vaultService = useVaultService();
  const [, getEditor] = useInstance();
  const [pasteError, setPasteError] = useState<string | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(true);
  const pendingScrollTargetRef = useRef<{ line?: number; highlight?: string }>({});

  // Image selection state
  const [selectedImageNodePos, setSelectedImageNodePos] = useState<number | null>(null);
  const [selectedAlignment, setSelectedAlignment] = useState<'left' | 'center' | 'right'>('center');
  const [imagePosition, setImagePosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);

  // Keep refs updated without triggering re-render
  useEffect(() => {
    defaultValueRef.current = defaultValue;
    onChangeRef.current = onChange;
  });

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
                const imageNodeType = state.schema.nodes.image ?? state.schema.nodes.imageBlock;
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

  // Image selection click handler
  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;

      // Check if clicked on an image
      const img = target.closest('img');
      if (img) {
        e.stopPropagation();

        // Get the ProseMirror view to find the node position
        const editor = getEditor();
        if (!editor) return;

        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const domNode = img;

          // Find the position of the image node in ProseMirror
          const pos = view.posAtDOM(domNode, 0);
          if (pos < 0) return;

          const node = view.state.doc.nodeAt(pos);
          if (!node) return;

          // Check if it's an image node
          const imageNodeType = view.state.schema.nodes.image ?? view.state.schema.nodes.imageBlock;
          if (!imageNodeType || node.type !== imageNodeType) return;

          // Get alignment from node attributes (default to center)
          const align = (node.attrs.align as 'left' | 'center' | 'right') || 'center';

          // Get image position for toolbar placement
          const rect = img.getBoundingClientRect();
          const containerRect = editorRootRef.current?.getBoundingClientRect();
          if (!containerRect) return;

          setSelectedAlignment(align);
          setImagePosition({
            top: rect.top - containerRect.top,
            left: rect.left - containerRect.left,
            width: rect.width,
          });
          selectedImageRef.current = img;
          setSelectedImageNodePos(pos);
        });

        return;
      }

      // Clicked outside image - deselect
      if (selectedImageNodePos !== null) {
        setSelectedImageNodePos(null);
        setImagePosition(null);
        selectedImageRef.current = null;
      }
    },
    [getEditor, selectedImageNodePos]
  );

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

        // Update the node's align attribute
        const tr = state.tr.setNodeMarkup(selectedImageNodePos, undefined, {
          ...node.attrs,
          align,
        });
        dispatch(tr);

        // Also update the DOM class
        if (selectedImageRef.current) {
          const wrapper = selectedImageRef.current.closest('.image-wrapper');
          if (wrapper) {
            wrapper.classList.remove('align-left', 'align-center', 'align-right');
            wrapper.classList.add(`align-${align}`);
          }
        }
      });
    },
    [getEditor, selectedImageNodePos]
  );

  // Handle delete image
  const handleDeleteImage = useCallback(() => {
    const editor = getEditor();
    if (!editor || selectedImageNodePos === null) return;

    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const { state, dispatch } = view;

      // Get the node to determine its size for deletion
      const node = state.doc.nodeAt(selectedImageNodePos);
      if (!node) return;

      // Calculate the end position of this node
      const nodeSize = node.nodeSize;
      const $pos = state.doc.resolve(selectedImageNodePos);
      const start = $pos.start();
      const end = start + nodeSize;

      // Create a transaction to delete the node
      const tr = state.tr.delete(start, end);
      dispatch(tr);

      // Clear selection state
      setSelectedImageNodePos(null);
      setImagePosition(null);
      selectedImageRef.current = null;
    });
  }, [getEditor, selectedImageNodePos]);

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

        // Update the node's width attribute
        const tr = state.tr.setNodeMarkup(selectedImageNodePos, undefined, {
          ...node.attrs,
          width,
        });
        dispatch(tr);
      });
    },
    [getEditor, selectedImageNodePos]
  );

  const { loading } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, defaultValueRef.current);

        // Configure image attributes (align and width) for DOM rendering
        ctx.set(imageAttr.key, (node) => {
          const align = node.attrs.align as 'left' | 'center' | 'right' | undefined;
          const width = node.attrs.width as number | undefined;
          return {
            class: align ? `align-${align}` : undefined,
            'data-align': align || 'center',
            width: width || undefined,
          };
        });

        // Configure image upload
        ctx.update(imageBlockConfig.key, (prev) => ({
          ...prev,
          onUpload: async (file: File) => {
            // TODO: Implement actual file upload logic
            // For now, create a local object URL
            return URL.createObjectURL(file);
          },
        }));

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
            onChangeRef.current?.(markdown);
          });
        }
      })
      .use(commonmark) // Base markdown schema (required for gfm)
      .use(gfm) // GFM: tables, strikethrough, task lists
      .use(history)
      .use(listener)
      .use(slash) // Slash command menu
      .use(math) // LaTeX math support
      .use(imageBlockComponent) // Image block with upload
      .use(imageInlineComponent) // Inline image support (for paste inserted images)
      .use(linkTooltipPlugin) // Link tooltip UI
      .use(block); // Block drag handle
  }, []);

  useEffect(() => {
    if (loading) {
      loadingRef.current = true;
      return;
    }

    loadingRef.current = false;
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
        onClick={handleEditorClick}
      >
        {loading && (
          <div className="milkdown-loading p-4 text-gray-500">Loading editor...</div>
        )}
        <div className="milkdown h-full flex flex-col">
          <Milkdown />
        </div>
      </div>

      {/* Image selection toolbar */}
      {selectedImageNodePos !== null && imagePosition && (
        <ImageToolbar
          alignment={selectedAlignment}
          position={imagePosition}
          onAlign={handleAlignmentChange}
          onDelete={handleDeleteImage}
          containerRef={editorRootRef as React.RefObject<HTMLElement>}
        />
      )}

      {/* Image resize handles */}
      {selectedImageNodePos !== null && (
        <ImageResizeHandles
          imageRef={selectedImageRef as React.RefObject<HTMLImageElement>}
          onResizeStart={() => {}}
          onResize={() => {}}
          onResizeEnd={handleResizeEnd}
        />
      )}

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
