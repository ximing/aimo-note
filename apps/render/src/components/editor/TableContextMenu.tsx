import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

export interface TableContextMenuProps {
  x: number;
  y: number;
  canDeleteCol: boolean;
  canDeleteRow: boolean;
  onClose: () => void;
  onInsertColLeft: () => void;
  onInsertColRight: () => void;
  onInsertRowUp: () => void;
  onInsertRowDown: () => void;
  onDeleteCol: () => void;
  onDeleteRow: () => void;
}

const MENU_MIN_WIDTH = 180;
const MENU_ESTIMATED_HEIGHT = 240;
const PADDING = 8;

export function TableContextMenu({
  x,
  y,
  canDeleteCol,
  canDeleteRow,
  onClose,
  onInsertColLeft,
  onInsertColRight,
  onInsertRowUp,
  onInsertRowDown,
  onDeleteCol,
  onDeleteRow,
}: TableContextMenuProps) {
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
  let adjustedX = x;
  if (x + MENU_MIN_WIDTH > window.innerWidth - PADDING) {
    adjustedX = window.innerWidth - MENU_MIN_WIDTH - PADDING;
  }

  let adjustedY = y;
  const spaceBelow = window.innerHeight - y;
  const spaceAbove = y;

  if (spaceBelow < MENU_ESTIMATED_HEIGHT && spaceAbove > spaceBelow) {
    adjustedY = y - MENU_ESTIMATED_HEIGHT;
  }

  const menuHeight = MENU_ESTIMATED_HEIGHT;
  if (adjustedY + menuHeight > window.innerHeight - PADDING) {
    adjustedY = window.innerHeight - menuHeight - PADDING;
  }

  adjustedY = Math.max(PADDING, adjustedY);

  const insertItems = [
    { label: '向左插入列', icon: <ArrowLeft size={14} />, onClick: onInsertColLeft },
    { label: '向右插入列', icon: <ArrowRight size={14} />, onClick: onInsertColRight },
    { label: '向上插入行', icon: <ArrowUp size={14} />, onClick: onInsertRowUp },
    { label: '向下插入行', icon: <ArrowDown size={14} />, onClick: onInsertRowDown },
  ];

  const deleteItems = [
    { label: '删除当前列', icon: <Trash2 size={14} />, onClick: onDeleteCol, disabled: !canDeleteCol },
    { label: '删除当前行', icon: <Trash2 size={14} />, onClick: onDeleteRow, disabled: !canDeleteRow },
  ];

  const handleInsertClick = (onClick: () => void) => {
    onClick();
    onClose();
  };

  const handleDeleteClick = (onClick: () => void, disabled?: boolean) => {
    if (!disabled) {
      onClick();
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      className="context-menu absolute z-50 min-w-[180px] bg-bg-primary border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.2)] py-1"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {insertItems.map((item, index) => (
        <button
          key={index}
          role="menuitem"
          type="button"
          onClick={() => handleInsertClick(item.onClick)}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-text-primary hover:bg-accent hover:text-white"
        >
          <span className="w-4">{item.icon}</span>
          {item.label}
        </button>
      ))}

      <div className="my-1 border-t border-border" />

      {deleteItems.map((item, index) => (
        <button
          key={index}
          role="menuitem"
          type="button"
          onClick={() => handleDeleteClick(item.onClick, item.disabled)}
          disabled={item.disabled}
          className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent hover:text-white ${
            item.disabled ? 'opacity-50 cursor-not-allowed' : 'text-destructive'
          }`}
        >
          <span className="w-4">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}
