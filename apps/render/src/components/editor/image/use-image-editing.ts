import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor as MilkdownEditor } from '@milkdown/kit/core';
import { editorViewCtx } from '@milkdown/kit/core';
import { NodeSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

export type ImageAlign = 'left' | 'center' | 'right';

export interface ImageOverlayPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface UseImageEditingParams {
  getEditor: () => MilkdownEditor | undefined;
  editorRootRef: React.RefObject<HTMLDivElement | null>;
  vaultPath?: string | null;
}

export interface UseImageEditingResult {
  selectedImageNodePos: number | null;
  selectedAlignment: ImageAlign;
  imagePosition: ImageOverlayPosition | null;
  selectedImageRef: React.RefObject<HTMLImageElement | null>;
  clearSelectedImage: () => void;
  syncSelectedImageFromView: (view: EditorView, clickedImage?: HTMLImageElement | null) => void;
  handleAlignmentChange: (align: ImageAlign) => void;
  handleDeleteImage: () => void;
  handleResize: () => void;
  handleResizeEnd: (width: number, height: number) => void;
}

export const useImageEditing = ({ getEditor, editorRootRef, vaultPath }: UseImageEditingParams): UseImageEditingResult => {
  const [selectedImageNodePos, setSelectedImageNodePos] = useState<number | null>(null);
  const [selectedAlignment, setSelectedAlignment] = useState<ImageAlign>('center');
  const [imagePosition, setImagePosition] = useState<ImageOverlayPosition | null>(null);
  const selectedImageRef = useRef<HTMLImageElement | null>(null);

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
  }, [editorRootRef]);

  const resolvePreviewImageUrl = useCallback(
    (src: string) => {
      if (!vaultPath) return src;
      if (/^(https?:|file:|data:|blob:|aimo-image:)/i.test(src)) {
        return src;
      }

      const normalizedPath = src.replace(/^([./\\])+/, '');
      return `aimo-image://vault?vaultPath=${encodeURIComponent(vaultPath)}&path=${encodeURIComponent(normalizedPath)}`;
    },
    [vaultPath]
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
  }, [editorRootRef, resolvePreviewImageUrl]);

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
      setSelectedAlignment((node.attrs.align as ImageAlign) || 'center');
      updateImageOverlayPosition(imageEl);
    },
    [clearSelectedImage, updateImageOverlayPosition]
  );

  const handleAlignmentChange = useCallback(
    (align: ImageAlign) => {
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

  const handleResizeEnd = useCallback(
    (width: number, _height: number) => {
      const editor = getEditor();
      if (!editor || selectedImageNodePos === null) return;

      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { state, dispatch } = view;

        const node = state.doc.nodeAt(selectedImageNodePos);
        if (!node) return;

        const nextWidth = Math.max(40, Math.round(width));
        const currentWidth = typeof node.attrs.width === 'number'
          ? Math.round(node.attrs.width)
          : Number.parseInt(String(node.attrs.width || ''), 10);

        if (Number.isFinite(currentWidth) && currentWidth === nextWidth) return;

        const nextAttrs: Record<string, unknown> = {
          ...node.attrs,
          width: nextWidth,
        };
        delete nextAttrs.height;

        const tr = state.tr.setNodeMarkup(selectedImageNodePos, undefined, nextAttrs);
        if (!tr.docChanged) return;

        dispatch(tr);
        window.requestAnimationFrame(() => syncSelectedImageFromView(view));
      });
    },
    [getEditor, selectedImageNodePos, syncSelectedImageFromView]
  );

  const handleRecalcImagePosition = useCallback(() => {
    if (selectedImageNodePos === null || !selectedImageRef.current) return;
    updateImageOverlayPosition(selectedImageRef.current);
  }, [selectedImageNodePos, updateImageOverlayPosition]);

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
  }, [editorRootRef, syncRenderedImages]);

  useEffect(() => {
    window.addEventListener('resize', handleRecalcImagePosition);
    const editorEl = editorRootRef.current;
    editorEl?.addEventListener('scroll', handleRecalcImagePosition);

    return () => {
      window.removeEventListener('resize', handleRecalcImagePosition);
      editorEl?.removeEventListener('scroll', handleRecalcImagePosition);
    };
  }, [editorRootRef, handleRecalcImagePosition]);

  return {
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
  };
};
