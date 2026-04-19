import { useEditor, useInstance } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx, commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
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

export interface MilkdownEditorInnerProps {
  onChange?: (markdown: string) => void;
  defaultValue?: string;
  className?: string;
  highlightQuery?: string;
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

  // Expose ProseMirror DOM via editorRef and apply search highlight
  useEffect(() => {
    if (!loadingRef.current) {
      if (editorRef) {
        const pm = document.querySelector('.milkdown .ProseMirror') as HTMLElement | null;
        editorRef.current.dom = pm;
      }
    }
  });

  // Apply highlight query to editor content
  useEffect(() => {
    if (!highlightQuery || loadingRef.current) return;

    const applyHighlight = () => {
      const pm = document.querySelector('.milkdown .ProseMirror');
      if (!pm) return;

      // Remove existing highlights first
      pm.querySelectorAll('.search-highlight-editor').forEach((el) => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent || ''), el);
          parent.normalize();
        }
      });

      // Walk text nodes and wrap matches
      const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT, null);
      const nodes: Text[] = [];
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        nodes.push(node);
      }

      const query = highlightQuery.toLowerCase();
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

      // Scroll first highlight into view
      const firstMark = pm.querySelector('.search-highlight-editor');
      if (firstMark) {
        firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    // Small delay to ensure DOM is ready after content load
    const timeout = setTimeout(applyHighlight, 100);
    return () => clearTimeout(timeout);
  }, [highlightQuery]);

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

  const { loading } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, defaultValueRef.current);

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

  return (
    <>
      <div ref={editorRootRef} className={`milkdown-wrapper h-full flex flex-col ${className}`} onPaste={handlePaste}>
        {loading && (
          <div className="milkdown-loading p-4 text-gray-500">Loading editor...</div>
        )}
        <div className="milkdown h-full flex flex-col">
          <Milkdown />
        </div>
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
