import type { ReactNode } from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { FileText, FolderPlus, Pencil, Trash2, FolderOpen, Copy, Link } from 'lucide-react';
import type { TreeNode } from '@/ipc/vault';
import { clipboard, shell } from '@/ipc';
import { useService } from '@rabjs/react';
import { VaultService } from '@/services/vault.service';

// 样式类
const contentClassName =
  'z-50 min-w-[180px] bg-bg-primary border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.2)] py-1 overflow-hidden';
const itemClassName =
  'flex items-center gap-2 px-3 py-2 text-sm text-text-primary text-left w-full cursor-default select-none outline-none data-[highlighted]:bg-accent data-[highlighted]:text-white data-[disabled]:opacity-50 data-[disabled]:pointer-events-none';
const separatorClassName = 'h-px bg-border my-1 mx-1';
const labelClassName =
  'px-3 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wide';

// ============================================
// Radix UI Context Menu - 用于 TreeNode 等声明式场景
// ============================================

export interface TreeNodeContextMenuProps {
  node: TreeNode | null;
  children: ReactNode;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
  onRename: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
}

/**
 * 目录树节点右键菜单组件
 * 使用 @radix-ui/react-context-menu 实现
 */
export function TreeNodeContextMenu({
  node,
  children,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: TreeNodeContextMenuProps) {
  const vaultService = useService(VaultService);
  const vaultPath = vaultService.path || '';
  const targetPath = node?.path || '';

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

  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className={contentClassName} collisionPadding={8}>
          {/* 新建操作 */}
          <ContextMenuPrimitive.Item
            className={itemClassName}
            onSelect={() => onNewFile(targetPath)}
          >
            <span className="w-4">
              <FileText size={14} />
            </span>
            新建文件
          </ContextMenuPrimitive.Item>
          <ContextMenuPrimitive.Item
            className={itemClassName}
            onSelect={() => onNewFolder(targetPath)}
          >
            <span className="w-4">
              <FolderPlus size={14} />
            </span>
            新建文件夹
          </ContextMenuPrimitive.Item>

          {/* 针对具体文件/文件夹的操作 */}
          {node && (
            <>
              <ContextMenuPrimitive.Separator className={separatorClassName} />
              <ContextMenuPrimitive.Item
                className={itemClassName}
                onSelect={() => handleOpenContainingFolder(node.path)}
              >
                <span className="w-4">
                  <FolderOpen size={14} />
                </span>
                打开所在文件夹
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Item
                className={itemClassName}
                onSelect={() => handleCopyAbsolutePath(node.path)}
              >
                <span className="w-4">
                  <Copy size={14} />
                </span>
                复制绝对路径
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Item
                className={itemClassName}
                onSelect={() => handleCopyRelativePath(node.path)}
              >
                <span className="w-4">
                  <Link size={14} />
                </span>
                复制相对路径
              </ContextMenuPrimitive.Item>

              <ContextMenuPrimitive.Separator className={separatorClassName} />
              <ContextMenuPrimitive.Label className={labelClassName}>
                当前文件
              </ContextMenuPrimitive.Label>
              <ContextMenuPrimitive.Item className={itemClassName} onSelect={() => onRename(node)}>
                <span className="w-4">
                  <Pencil size={14} />
                </span>
                重命名
              </ContextMenuPrimitive.Item>
              <ContextMenuPrimitive.Item
                className={`${itemClassName} text-destructive data-[highlighted]:text-destructive`}
                onSelect={() => onDelete(node)}
              >
                <span className="w-4">
                  <Trash2 size={14} />
                </span>
                删除
              </ContextMenuPrimitive.Item>
            </>
          )}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}

// ============================================
// 命令式 Context Menu - 用于编辑器页面等需要手动控制位置的场景
// ============================================

import { useEffect, useRef } from 'react';

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

/**
 * 命令式右键菜单组件
 * 用于编辑器页面等需要手动控制显示位置的场景
 */
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
  const vaultService = useService(VaultService);
  const vaultPath = vaultService.path || '';
  const targetPath = node?.path || '';

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
  const MENU_MIN_WIDTH = 180;
  const MENU_ESTIMATED_HEIGHT = 200;
  const PADDING = 8;

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
  if (adjustedY + MENU_ESTIMATED_HEIGHT > window.innerHeight - PADDING) {
    adjustedY = window.innerHeight - MENU_ESTIMATED_HEIGHT - PADDING;
  }
  adjustedY = Math.max(PADDING, adjustedY);

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

  const handleItemClick = (handler: () => void) => {
    handler();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className={contentClassName}
      style={{ left: adjustedX, top: adjustedY, position: 'fixed' }}
    >
      {/* 新建操作 */}
      <button
        type="button"
        className={itemClassName}
        onClick={() => handleItemClick(() => onNewFile(targetPath))}
      >
        <span className="w-4">
          <FileText size={14} />
        </span>
        新建文件
      </button>
      <button
        type="button"
        className={itemClassName}
        onClick={() => handleItemClick(() => onNewFolder(targetPath))}
      >
        <span className="w-4">
          <FolderPlus size={14} />
        </span>
        新建文件夹
      </button>

      {/* 针对具体文件/文件夹的操作 */}
      {node && (
        <>
          <div className={separatorClassName} />
          <button
            type="button"
            className={itemClassName}
            onClick={() => handleItemClick(() => handleOpenContainingFolder(node.path))}
          >
            <span className="w-4">
              <FolderOpen size={14} />
            </span>
            打开所在文件夹
          </button>
          <button
            type="button"
            className={itemClassName}
            onClick={() => handleItemClick(() => handleCopyAbsolutePath(node.path))}
          >
            <span className="w-4">
              <Copy size={14} />
            </span>
            复制绝对路径
          </button>
          <button
            type="button"
            className={itemClassName}
            onClick={() => handleItemClick(() => handleCopyRelativePath(node.path))}
          >
            <span className="w-4">
              <Link size={14} />
            </span>
            复制相对路径
          </button>

          <div className={separatorClassName} />
          <div className={labelClassName}>当前文件</div>
          <button
            type="button"
            className={itemClassName}
            onClick={() => handleItemClick(() => onRename(node))}
          >
            <span className="w-4">
              <Pencil size={14} />
            </span>
            重命名
          </button>
          <button
            type="button"
            className={`${itemClassName} text-destructive`}
            onClick={() => handleItemClick(() => onDelete(node))}
          >
            <span className="w-4">
              <Trash2 size={14} />
            </span>
            删除
          </button>
        </>
      )}
    </div>
  );
}

// 导出 Radix UI 原始组件，方便其他地方自定义使用
export { ContextMenuPrimitive };
