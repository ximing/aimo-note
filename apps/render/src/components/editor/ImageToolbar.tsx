import React, { useCallback, useMemo } from 'react';

export interface ImageToolbarProps {
  alignment: 'left' | 'center' | 'right';
  position: { top: number; left: number; width: number; height: number };
  onAlign: (align: 'left' | 'center' | 'right') => void;
  onDelete: () => void;
  containerRef: React.RefObject<HTMLElement>;
}

type Alignment = 'left' | 'center' | 'right';

const TOOLBAR_HEIGHT = 40;
const TOOLBAR_OFFSET = 8;
const TRIANGLE_SIZE = 8;

// SVG Icons for alignment buttons
const LeftAlignIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <line x1="2" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="14" x2="8" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CenterAlignIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <line x1="2" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="4" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="14" x2="10" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const RightAlignIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <line x1="8" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="4" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="14" x2="8" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const DeleteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path
      d="M3 5h12M7 5V3h4v2M5 5v10a1 1 0 001 1h6a1 1 0 001-1V5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7 8v4M11 8v4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BUTTON_TOOLTIPS: Record<Alignment | 'delete', string> = {
  left: '左对齐',
  center: '居中',
  right: '右对齐',
  delete: '删除图片',
};

const BUTTON_ICON_MAP: Record<Alignment, React.FC> = {
  left: LeftAlignIcon,
  center: CenterAlignIcon,
  right: RightAlignIcon,
};

// Calculate toolbar position based on image position and container bounds
const calculateToolbarPosition = (
  position: { top: number; left: number; width: number; height: number },
  containerRef: React.RefObject<HTMLElement>,
  toolbarWidth: number
): { top: number; left: number; showBelow: boolean } | null => {
  const containerEl = containerRef.current;
  if (!containerEl) return null;

  const containerRect = containerEl.getBoundingClientRect();

  const imageTop = position.top;
  const imageLeft = position.left;
  const imageWidth = position.width;
  const imageHeight = position.height;

  let toolbarTop = imageTop - TOOLBAR_HEIGHT - TOOLBAR_OFFSET;
  let showBelow = false;

  if (toolbarTop < TRIANGLE_SIZE) {
    toolbarTop = imageTop + imageHeight + TOOLBAR_OFFSET;
    showBelow = true;
  }

  const toolbarLeft = imageLeft + imageWidth / 2;
  const toolbarHalfWidth = toolbarWidth / 2;
  let adjustedLeft = toolbarLeft;

  if (toolbarLeft - toolbarHalfWidth < 0) {
    adjustedLeft = toolbarHalfWidth;
  } else if (toolbarLeft + toolbarHalfWidth > containerRect.width) {
    adjustedLeft = containerRect.width - toolbarHalfWidth;
  }

  return {
    top: toolbarTop,
    left: adjustedLeft,
    showBelow,
  };
};

export const ImageToolbar: React.FC<ImageToolbarProps> = ({
  alignment,
  position,
  onAlign,
  onDelete,
  containerRef,
}) => {
  const handleAlign = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, align: Alignment) => {
      e.stopPropagation();
      onAlign(align);
    },
    [onAlign]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onDelete();
    },
    [onDelete]
  );

  // Default toolbar width estimate for initial render
  const estimatedToolbarWidth = 180;

  const positionState = useMemo(
    () => calculateToolbarPosition(position, containerRef, estimatedToolbarWidth),
    [position, containerRef]
  );

  if (!positionState) return null;

  const alignments: Alignment[] = ['left', 'center', 'right'];

  return (
    <div
      className="image-toolbar"
      style={{
        position: 'absolute',
        top: positionState.top,
        left: positionState.left,
        transform: 'translateX(-50%)',
        zIndex: 100,
        background: '#1a1a1a',
        borderRadius: 8,
        padding: '6px 8px',
        display: 'flex',
        gap: 2,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Triangle pointer */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          [positionState.showBelow ? 'top' : 'bottom']: -TRIANGLE_SIZE,
          width: 0,
          height: 0,
          borderLeft: `${TRIANGLE_SIZE}px solid transparent`,
          borderRight: `${TRIANGLE_SIZE}px solid transparent`,
          [positionState.showBelow ? 'borderBottom' : 'borderTop']: `${TRIANGLE_SIZE}px solid #1a1a1a`,
        }}
      />

      {/* Alignment buttons */}
      {alignments.map((align) => {
        const Icon = BUTTON_ICON_MAP[align];
        const isActive = alignment === align;

        return (
          <button
            key={align}
            title={BUTTON_TOOLTIPS[align]}
            onClick={(e) => handleAlign(e, align)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 28,
              border: 'none',
              borderRadius: 4,
              background: isActive ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
              color: isActive ? '#ffffff' : '#a0a0a0',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#a0a0a0';
              }
            }}
          >
            <Icon />
          </button>
        );
      })}

      {/* Separator */}
      <div
        style={{
          width: 1,
          height: 20,
          background: 'rgba(255, 255, 255, 0.2)',
          margin: '4px 4px',
        }}
      />

      {/* Delete button */}
      <button
        title={BUTTON_TOOLTIPS.delete}
        onClick={handleDelete}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 28,
          border: 'none',
          borderRadius: 4,
          background: 'transparent',
          color: '#a0a0a0',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 59, 48, 0.2)';
          e.currentTarget.style.color = '#ff3b30';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#a0a0a0';
        }}
      >
        <DeleteIcon />
      </button>
    </div>
  );
};
