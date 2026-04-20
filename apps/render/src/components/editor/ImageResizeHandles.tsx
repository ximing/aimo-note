import React, { useCallback, useRef, useEffect } from 'react';

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface ImageOverlayPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ImageResizeHandlesProps {
  imageRef: React.RefObject<HTMLImageElement>;
  position: ImageOverlayPosition;
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
  origWidth: number;
  origHeight: number;
  maxWidth: number;
  maxHeight: number;
  handle: HandlePosition;
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const doResize = (
  imageEl: HTMLImageElement,
  state: ResizeState,
  dx: number,
  dy: number,
  shiftKey: boolean,
  onResize: (width: number, height: number) => void
) => {
  let newWidth = state.styleWidth;
  let newHeight = state.styleHeight;

  switch (state.handle) {
    case 'e':
    case 'se':
    case 'ne':
      newWidth = clamp(state.styleWidth + dx, MIN_WIDTH, state.maxWidth);
      break;
    case 'w':
    case 'sw':
    case 'nw':
      newWidth = clamp(state.styleWidth - dx, MIN_WIDTH, state.maxWidth);
      break;
    default:
      break;
  }

  switch (state.handle) {
    case 's':
    case 'se':
    case 'sw':
      newHeight = clamp(state.styleHeight + dy, MIN_HEIGHT, state.maxHeight);
      break;
    case 'n':
    case 'ne':
    case 'nw':
      newHeight = clamp(state.styleHeight - dy, MIN_HEIGHT, state.maxHeight);
      break;
    default:
      break;
  }

  if (shiftKey && state.origWidth > 0 && state.origHeight > 0) {
    const ratio = state.origWidth / state.origHeight;
    const widthDriven =
      Math.abs(dx) >= Math.abs(dy) || state.handle === 'e' || state.handle === 'w';
    if (widthDriven) {
      newHeight = clamp(Math.round(newWidth / ratio), MIN_HEIGHT, state.maxHeight);
    } else {
      newWidth = clamp(Math.round(newHeight * ratio), MIN_WIDTH, state.maxWidth);
    }
  }

  imageEl.style.marginLeft = '';
  imageEl.style.marginTop = '';
  imageEl.style.width = `${newWidth}px`;
  imageEl.style.height = `${newHeight}px`;
  onResize(newWidth, newHeight);
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
  activeListenersRef: React.MutableRefObject<{
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: () => void;
  } | null>
) => {
  const { imageEl, clientX, clientY, pointerId, handle, onResizeStart, onResize, onResizeEnd } =
    params;

  onResizeStart();
  imageEl.style.marginLeft = '';
  imageEl.style.marginTop = '';

  const maxWidth = imageEl.parentElement?.offsetWidth || 800;
  const maxHeight = Math.max(
    imageEl.parentElement?.offsetHeight || imageEl.offsetHeight || 800,
    MIN_HEIGHT
  );

  const state: ResizeState = {
    startX: clientX,
    startY: clientY,
    styleWidth: parseInt(imageEl.style.width, 10) || imageEl.offsetWidth,
    styleHeight: parseInt(imageEl.style.height, 10) || imageEl.offsetHeight,
    origWidth: imageEl.naturalWidth,
    origHeight: imageEl.naturalHeight,
    maxWidth,
    maxHeight,
    handle,
  };

  const onPointerMove = (moveEvent: PointerEvent) => {
    const dx = moveEvent.clientX - state.startX;
    const dy = moveEvent.clientY - state.startY;
    doResize(imageEl, state, dx, dy, moveEvent.shiftKey, onResize);
  };

  const onPointerUp = () => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    imageEl.style.removeProperty('user-select');
    if (imageEl.hasPointerCapture(pointerId)) {
      imageEl.releasePointerCapture(pointerId);
    }
    activeListenersRef.current = null;
    onResizeEnd(imageEl.offsetWidth, imageEl.offsetHeight);
  };

  imageEl.style.userSelect = 'none';
  imageEl.setPointerCapture(pointerId);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);

  activeListenersRef.current = { onPointerMove, onPointerUp };
};

export const ImageResizeHandles: React.FC<ImageResizeHandlesProps> = ({
  imageRef,
  position,
  onResizeStart,
  onResize,
  onResizeEnd,
}) => {
  const onResizeRef = useRef(onResize);
  const onResizeEndRef = useRef(onResizeEnd);
  const onResizeStartRef = useRef(onResizeStart);
  const activeListenersRef = useRef<{
    onPointerMove: (e: PointerEvent) => void;
    onPointerUp: () => void;
  } | null>(null);

  useEffect(() => {
    onResizeRef.current = onResize;
    onResizeEndRef.current = onResizeEnd;
    onResizeStartRef.current = onResizeStart;
  }, [onResize, onResizeEnd, onResizeStart]);

  useEffect(() => {
    return () => {
      if (activeListenersRef.current) {
        document.removeEventListener('pointermove', activeListenersRef.current.onPointerMove);
        document.removeEventListener('pointerup', activeListenersRef.current.onPointerUp);
        activeListenersRef.current = null;
      }
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, handle: HandlePosition) => {
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
    <div
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        width: position.width,
        height: position.height,
        pointerEvents: 'none',
        zIndex: 90,
      }}
    >
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
            pointerEvents: 'auto',
            touchAction: 'none',
            ...positionStyles[handle],
          }}
          onPointerDown={(e) => handlePointerDown(e, handle)}
        />
      ))}
    </div>
  );
};
