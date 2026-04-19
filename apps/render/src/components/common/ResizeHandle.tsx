import { useCallback, useEffect, useRef } from 'react';

interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
  onResizeEnd: () => void;
  side?: 'left' | 'right';
}

export function ResizeHandle({ onResize, onResizeEnd, side = 'right' }: ResizeHandleProps) {
  const isDragging = useRef(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      lastX.current = e.clientX;

      const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        const deltaX = side === 'left' ? lastX.current - e.clientX : e.clientX - lastX.current;
        lastX.current = e.clientX;
        onResize(deltaX);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        onResizeEnd();
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onResize, onResizeEnd, side]
  );

  // Prevent text selection while dragging
  useEffect(() => {
    const handleSelectStart = (e: Event) => {
      if (isDragging.current) {
        e.preventDefault();
      }
    };
    document.addEventListener('selectstart', handleSelectStart);
    return () => document.removeEventListener('selectstart', handleSelectStart);
  }, []);

  return (
    <div
      className="resize-handle w-1 hover:w-1.5 cursor-col-resize flex-shrink-0 group relative"
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-y-0 w-0.5 bg-border group-hover:bg-accent group-hover:w-1 transition-all" />
    </div>
  );
}
