import { useState } from 'react';
import type { TreeNode as TreeNodeType } from '@/ipc/vault';
import { useVaultService } from '@/services';
import { useNavigate } from 'react-router';
import { ContextMenu } from '../common/ContextMenu';

interface TreeNodeProps {
  node: TreeNodeType;
  depth?: number;
}

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
}

export function TreeNode({ node, depth = 0 }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ show: false, x: 0, y: 0 });
  const vaultService = useVaultService();
  const navigate = useNavigate();
  const isFolder = node.type === 'folder';

  const handleClick = () => {
    if (isFolder) {
      setIsExpanded(!isExpanded);
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
        style={{ paddingLeft: depth * 16 }}
      >
        {isFolder && (
          <span className="w-4 text-center text-muted-foreground">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        <span className={isFolder ? 'folder-icon' : 'file-icon'}>
          {isFolder ? '📁' : '📄'}
        </span>
        <span className="truncate">{node.name}</span>
      </button>
      {isFolder && isExpanded && node.children && (
        <div className="children">
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
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
