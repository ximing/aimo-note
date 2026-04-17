import { useState } from 'react';
import type { TreeNode as TreeNodeType } from '@/ipc/vault';
import { useVaultService } from '@/services';
import { useNavigate } from 'react-router';

interface TreeNodeProps {
  node: TreeNodeType;
  depth?: number;
}

export function TreeNode({ node, depth = 0 }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
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

  return (
    <div className="tree-node">
      <button
        type="button"
        onClick={handleClick}
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
    </div>
  );
}
