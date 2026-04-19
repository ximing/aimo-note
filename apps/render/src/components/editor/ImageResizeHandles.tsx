import React, { useCallback, useRef, useEffect } from 'react';

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ImageResizeHandlesProps {
  imageRef: React.RefObject<HTMLImageElement>;
  onResizeStart: () => void;
  onResize: (width: number, height: number) => void;
  onResizeEnd: (width: number, height: number) => void;
}

const MIN_WIDTH = 40;
const MIN_HEIGHT = 40;
const HANDLE_SIZE = 12;

const positionStyles: Record<HandlePosition, React.CSSProperties> = {
  nw: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nw-resize' },
  n: { top: -HANDLE_SIZE / 2, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
  ne: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'ne-resize' },
  e: { top: '50%', right: -HANDLE_SIZE / 2, transform: 'translateY(-50%)', cursor: 'e-resize' },
  se: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'se-resize' },
  s: { bottom: -HANDLE_SIZE / 2, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
  sw: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'sw-resize' },
  w: { top: '50%', left: -HANDLE_SIZE / 2, transform: 'translateY(-50%)', cursor: 'w-resize' },
};

interface ResizeState {
  startX: number;
  startY: number;
  styleWidth: number;
  styleHeight: number;
  origMarginLeft: number;
  origMarginTop: number;
  origWidth: number;
  origHeight: number;
  MAX_WIDTH: number;
  handle: HandlePosition;
}

const doResize = (
  imageEl: HTMLImageElement,
  state: ResizeState,
  dx: number,
  dy: number,
  shiftKey: boolean,
  onResize: (width: number, height: number) => void
) => {
  let newWidth: number;
  let newHeight: number;

  switch (state.handle) {
    case 'se':
      newWidth = Math.max(MIN_WIDTH, Math.min(state.MAX_WIDTH, state.styleWidth + dx));
      if (shiftKey) {
        const ratio = state.origWidth / state.origHeight;
        imageEl.style.width = `${newWidth}px`;
        imageEl.style.height = `${newWidth / ratio}px`;
      } else {
        newHeight = Math.max(MIN_HEIGHT, state.styleHeight + dy);
        imageEl.style.width = `${newWidth}px`;
        imageEl.style.height = `${newHeight}px`;
      }
      break;
    case 's':
      newHeight = Math.max(MIN_HEIGHT, state.styleHeight + dy);
      imageEl.style.height = `${newHeight}px`;
      break;
    case 'e':
      newWidth = Math.max(MIN_WIDTH, Math.min(state.MAX_WIDTH, state.styleWidth + dx));
      imageEl.style.width = `${newWidth}px`;
      break;
    case 'sw':
      newWidth = Math.max(MIN_WIDTH, Math.min(state.MAX_WIDTH, state.styleWidth - dx));
      imageEl.style.width = `${newWidth}px`;
      imageEl.style.marginLeft = `${state.origMarginLeft + dx}px`;
      break;
    case 'w':
      newWidth = Math.max(MIN_WIDTH, Math.min(state.MAX_WIDTH, state.styleWidth - dx));
      imageEl.style.width = `${newWidth}px`;
      imageEl.style.marginLeft = `${state.origMarginLeft + dx}px`;
      break;
    case 'nw':
      newWidth = Math.max(MIN_WIDTH, Math.min(state.MAX_WIDTH, state.styleWidth - dx));
      if (shiftKey) {
        const ratio = state.origWidth / state.origHeight;
        imageEl.style.width = `${newWidth}px`;
        imageEl.style.height = `${newWidth / ratio}px`;
      } else {
        newHeight = Math.max(MIN_HEIGHT, state.styleHeight - dy);
        imageEl.style.width = `${newWidth}px`;
        imageEl.style.height = `${newHeight}px`;
      }
      imageEl.style.marginLeft = `${state.origMarginLeft + dx}px`;
      imageEl.style.marginTop = `${state.origMarginTop + dy}px`;
      break;
    case 'n':
      newHeight = Math.max(MIN_HEIGHT, state.styleHeight - dy);
      imageEl.style.height = `${newHeight}px`;
      imageEl.style.marginTop = `${state.origMarginTop + dy}px`;
      break;
    case 'ne':
      newWidth = Math.max(MIN_WIDTH, Math.min(state.MAX_WIDTH, state.styleWidth + dx));
      if (shiftKey) {
        const ratio = state.origWidth / state.origHeight;
        imageEl.style.width = `${newWidth}px`;
        imageEl.style.height = `${newWidth / ratio}px`;
      } else {
        newHeight = Math.max(MIN_HEIGHT, state.styleHeight - dy);
        imageEl.style.width = `${newWidth}px`;
        imageEl.style.height = `${newHeight}px`;
      }
      imageEl.style.marginTop = `${state.origMarginTop + dy}px`;
      break;
  }

  onResize(imageEl.offsetWidth, imageEl.offsetHeight);
};

interface InitResizeParams {
  imageEl: HTMLImageElement;
  clientX: number;
  clientY: number;
  pointerId: number;
  handle: HandlePosition;
  onResizeStart: () => void;
  onResize: (width: number, height: number) => void;
  onResizeEnd: (width: number, height: number) => void;
}

const initResize = (
  params: InitResizeParams,
  activeListenersRef: React.MutableRefObject<{ onMouseMove: (e: MouseEvent) => void; onMouseUp: () => void } | null>
) => {
  const { imageEl, clientX, clientY, pointerId, handle, onResizeStart, onResize, onResizeEnd } = params;

  onResizeStart();

  const state: ResizeState = {
    startX: clientX,
    startY: clientY,
    styleWidth: parseInt(imageEl.style.width) || imageEl.offsetWidth,
    styleHeight: parseInt(imageEl.style.height) || imageEl.offsetHeight,
    origMarginLeft: parseInt(imageEl.style.marginLeft || '0'),
    origMarginTop: parseInt(imageEl.style.marginTop || '0'),
    origWidth: imageEl.naturalWidth,
    origHeight: imageEl.naturalHeight,
    MAX_WIDTH: imageEl.parentElement?.offsetWidth || 800,
    handle,
  };

  const onMouseMove = (moveEvent: MouseEvent) => {
    const dx = moveEvent.clientX - state.startX;
    const dy = moveEvent.clientY - state.startY;
    doResize(imageEl, state, dx, dy, moveEvent.shiftKey, onResize);
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    imageEl.style.removeProperty('user-select');
    imageEl.releasePointerCapture(pointerId);
    activeListenersRef.current = null;
    onResizeEnd(imageEl.offsetWidth, imageEl.offsetHeight);
  };

  imageEl.style.userSelect = 'none';
  imageEl.setPointerCapture(pointerId);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  activeListenersRef.current = { onMouseMove, onMouseUp };
};

export const ImageResizeHandles: React.FC<ImageResizeHandlesProps> = ({
  imageRef,
  onResizeStart,
  onResize,
  onResizeEnd,
}) => {
  const onResizeRef = useRef(onResize);
  const onResizeEndRef = useRef(onResizeEnd);
  const onResizeStartRef = useRef(onResizeStart);
  const activeListenersRef = useRef<{ onMouseMove: (e: MouseEvent) => void; onMouseUp: () => void } | null>(null);

  useEffect(() => {
    onResizeRef.current = onResize;
    onResizeEndRef.current = onResizeEnd;
    onResizeStartRef.current = onResizeStart;
  }, [onResize, onResizeEnd, onResizeStart]);

  // Cleanup active listeners on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (activeListenersRef.current) {
        document.removeEventListener('mousemove', activeListenersRef.current.onMouseMove);
        document.removeEventListener('mouseup', activeListenersRef.current.onMouseUp);
        activeListenersRef.current = null;
      }
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.PointerEvent, handle: HandlePosition) => {
      e.preventDefault();
      e.stopPropagation();

      const imageEl = imageRef.current;
      if (!imageEl) return;

      if (imageEl.naturalWidth === 0) {
        const loadHandler = () => {
          imageEl.removeEventListener('load', loadHandler);
          initResize(
            {
              imageEl,
              clientX: e.clientX,
              clientY: e.clientY,
              pointerId: e.pointerId,
              handle,
              onResizeStart: onResizeStartRef.current,
              onResize: onResizeRef.current,
              onResizeEnd: onResizeEndRef.current,
            },
            activeListenersRef
          );
        };
        imageEl.addEventListener('load', loadHandler);
        return;
      }

      initResize(
        {
          imageEl,
          clientX: e.clientX,
          clientY: e.clientY,
          pointerId: e.pointerId,
          handle,
          onResizeStart: onResizeStartRef.current,
          onResize: onResizeRef.current,
          onResizeEnd: onResizeEndRef.current,
        },
        activeListenersRef
      );
    },
    [imageRef]
  );

  const handles: HandlePosition[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <>
      {handles.map((handle) => (
        <div
          key={handle}
          className="resize-handle"
          style={{
            position: 'absolute',
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            background: 'white',
            border: '2px solid var(--accent)',
            borderRadius: '50%',
            zIndex: 10,
            ...positionStyles[handle],
          }}
          onMouseDown={(e) => handleMouseDown(e as unknown as React.PointerEvent, handle)}
        />
      ))}
    </>
  );
};
