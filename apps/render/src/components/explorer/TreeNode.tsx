import { useState } from 'react';
import type { TreeNode as TreeNodeType } from '@/ipc/vault';
import { useService } from '@rabjs/react';
import { useNavigate } from 'react-router';
import { ContextMenu } from '../common/ContextMenu';
import { VaultService } from '@/services/vault.service';
import { File, Folder, ChevronRight, ChevronDown } from 'lucide-react';

interface TreeNodeProps {
  node: TreeNodeType;
  depth?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  expandedPaths?: Set<string>;
  onToggleExpandDeep?: (path: string) => void;
}

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
}

export function TreeNode({
  node,
  depth = 0,
  isExpanded = false,
  onToggleExpand,
  expandedPaths,
  onToggleExpandDeep,
}: TreeNodeProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ show: false, x: 0, y: 0 });
  const vaultService = useService(VaultService);
  const navigate = useNavigate();
  const isFolder = node.type === 'folder';

  // Check if this node or any children are expanded
  const hasExpandedDescendant = expandedPaths?.has(node.path) || false;

  const handleClick = () => {
    if (isFolder) {
      onToggleExpand?.();
      onToggleExpandDeep?.(node.path);
    } else {
      vaultService.setActiveFile(node.path);
      navigate('/editor');
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ show: true, x: e.clientX, y: e.clientY });
  };

  const handleNewFile = async (parentPath: string) => {
    const name = window.prompt('Enter file name:');
    if (name) {
      await vaultService.createNote(parentPath, name);
    }
  };

  const handleNewFolder = async (parentPath: string) => {
    const name = window.prompt('Enter folder name:');
    if (name) {
      await vaultService.createFolder(parentPath, name);
    }
  };

  const handleRename = async (n: TreeNodeType) => {
    const newName = window.prompt('Enter new name:', n.name);
    if (newName && newName !== n.name) {
      await vaultService.renameNode(n, newName);
    }
  };

  const handleDelete = async (n: TreeNodeType) => {
    if (window.confirm(`Delete "${n.name}"?`)) {
      await vaultService.deleteNode(n);
    }
  };

  const closeContextMenu = () => {
    setContextMenu({ show: false, x: 0, y: 0 });
  };

  return (
    <div className="tree-node relative">
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className="flex items-center gap-1 w-full px-2 py-1 hover:bg-accent rounded text-left"
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        {isFolder && (
          <span className="w-4 text-center text-muted-foreground">
            {isExpanded || hasExpandedDescendant ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </span>
        )}
        {isFolder ? <Folder size={14} className="text-muted-foreground" /> : <File size={14} className="text-muted-foreground" />}
        <span className="truncate text-sm">{node.name}</span>
      </button>
      {isFolder && (isExpanded || hasExpandedDescendant) && node.children && (
        <div className="children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              isExpanded={expandedPaths?.has(child.path) || false}
              onToggleExpand={() => onToggleExpandDeep?.(child.path)}
              expandedPaths={expandedPaths}
              onToggleExpandDeep={onToggleExpandDeep}
            />
          ))}
        </div>
      )}
      {contextMenu.show && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={node}
          onClose={closeContextMenu}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
