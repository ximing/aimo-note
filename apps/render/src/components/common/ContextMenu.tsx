import { useEffect, useRef } from 'react';
import type { TreeNode } from '@/ipc/vault';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  node: TreeNode | null;
  onClose: () => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
}

const MENU_MIN_WIDTH = 180;
const MENU_ESTIMATED_HEIGHT = 200;
const PADDING = 8;

export function ContextMenu({
  x,
  y,
  node,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  // Calculate right edge overflow
  let adjustedX = x;
  if (x + MENU_MIN_WIDTH > window.innerWidth - PADDING) {
    adjustedX = window.innerWidth - MENU_MIN_WIDTH - PADDING;
  }

  // Calculate bottom edge overflow, prefer showing below click point
  let adjustedY = y;
  const spaceBelow = window.innerHeight - y;
  const spaceAbove = y;

  if (spaceBelow < MENU_ESTIMATED_HEIGHT && spaceAbove > spaceBelow) {
    // Not enough space below, more space above - flip to above
    adjustedY = y - MENU_ESTIMATED_HEIGHT;
  }
  // Ensure bottom edge doesn't clip
  const menuHeight = MENU_ESTIMATED_HEIGHT;
  if (adjustedY + menuHeight > window.innerHeight - PADDING) {
    adjustedY = window.innerHeight - menuHeight - PADDING;
  }
  // Ensure doesn't clip at top
  adjustedY = Math.max(PADDING, adjustedY);

  const targetPath = node?.path || '';

  const items: ContextMenuItem[] = [
    {
      label: 'New File',
      icon: '📄',
      onClick: () => onNewFile(targetPath),
    },
    {
      label: 'New Folder',
      icon: '📁',
      onClick: () => onNewFolder(targetPath),
    },
    ...(node
      ? [
          {
            label: 'Rename',
            icon: '✏️',
            onClick: () => onRename(node),
          },
          {
            label: 'Delete',
            icon: '🗑️',
            danger: true,
            onClick: () => onDelete(node),
          },
        ]
      : []),
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu absolute z-50 min-w-[180px] bg-background border border-border rounded-lg shadow-lg py-1"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          type="button"
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent ${
            item.danger ? 'text-destructive hover:text-destructive' : ''
          }`}
        >
          {item.icon && <span className="w-5 text-center">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  );
}
