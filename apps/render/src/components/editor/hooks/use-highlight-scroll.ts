import { useCallback, useEffect, useRef } from 'react';
import type { Editor as MilkdownEditor } from '@milkdown/kit/core';
import { editorViewCtx } from '@milkdown/kit/core';

interface UseHighlightScrollParams {
  getEditor: () => MilkdownEditor | undefined;
  editorRootRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  highlightQuery?: string;
  targetLine?: number;
}

export const useHighlightScroll = ({
  getEditor,
  editorRootRef,
  loading,
  highlightQuery,
  targetLine,
}: UseHighlightScrollParams) => {
  const pendingScrollTargetRef = useRef<{ line?: number; highlight?: string }>({});

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
  }, [editorRootRef]);

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
  }, [editorRootRef, highlightQuery, scrollToFirstHighlight, scrollToLineNumber, targetLine]);

  useEffect(() => {
    pendingScrollTargetRef.current = {
      line: targetLine,
      highlight: highlightQuery?.trim() || undefined,
    };
  }, [highlightQuery, targetLine]);

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
};
