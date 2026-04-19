import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { FileText, FolderPlus, Pencil, Trash2, FolderOpen, Copy, Link } from 'lucide-react';
import type { TreeNode } from '@/ipc/vault';
import { clipboard, shell } from '@/ipc';
import { useService } from '@rabjs/react';
import { VaultService } from '@/services/vault.service';

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

type MenuItem = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  section?: string;
};

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
  const vaultService = useService(VaultService);
  const vaultPath = vaultService.path || '';

  const handleOpenContainingFolder = async (fullPath: string) => {
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    const absolutePath = vaultPath + '/' + dirPath;
    await shell.openPath(absolutePath);
  };

  const handleCopyAbsolutePath = async (fullPath: string) => {
    const absolutePath = vaultPath + '/' + fullPath;
    await clipboard.writeText(absolutePath);
  };

  const handleCopyRelativePath = async (fullPath: string) => {
    await clipboard.writeText(fullPath);
  };

  const items: MenuItem[] = [
    { label: '新建文件', icon: <FileText size={14} />, onClick: () => onNewFile(targetPath) },
    { label: '新建文件夹', icon: <FolderPlus size={14} />, onClick: () => onNewFolder(targetPath) },
    ...(node
      ? [
          { label: '打开所在文件夹', icon: <FolderOpen size={14} />, onClick: () => handleOpenContainingFolder(node.path) },
          { label: '复制绝对路径', icon: <Copy size={14} />, onClick: () => handleCopyAbsolutePath(node.path) },
          { label: '复制相对路径', icon: <Link size={14} />, onClick: () => handleCopyRelativePath(node.path) },
          { label: '重命名', icon: <Pencil size={14} />, onClick: () => onRename(node), section: '当前文件' },
          { label: '删除', icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete(node) },
        ]
      : []),
  ];

  return (
    <div
      ref={menuRef}
      className="context-menu absolute z-50 min-w-[180px] bg-bg-primary border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.2)] py-1"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, index) => (
        <div key={index}>
          {item.section && (
            <div className="px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide">
              {item.section}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent hover:text-white ${
              item.danger ? 'text-destructive' : 'text-text-primary'
            }`}
          >
            <span className="w-4">{item.icon}</span>
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
