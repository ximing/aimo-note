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
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 200);

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
      className="context-menu absolute z-50 min-w-[160px] bg-background border border-border rounded-lg shadow-lg py-1"
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
