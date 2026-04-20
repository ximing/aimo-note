import type { TreeNode as TreeNodeType } from '@/ipc/vault';
import { useService } from '@rabjs/react';
import { useNavigate } from 'react-router';
import { TreeNodeContextMenu } from '../common/ContextMenu';
import { VaultService } from '@/services/vault.service';
import { useUIService } from '@/services/ui.service';
import { File, Folder, ChevronRight, ChevronDown } from 'lucide-react';

interface TreeNodeProps {
  node: TreeNodeType;
  depth?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  expandedPaths?: Set<string>;
  onToggleExpandDeep?: (path: string) => void;
  onNewFile?: (parentPath: string) => void;
  onNewFolder?: (parentPath: string) => void;
  onRename?: (node: TreeNodeType) => void;
  onDelete?: (node: TreeNodeType) => void;
}

export function TreeNode({
  node,
  depth = 0,
  isExpanded = false,
  onToggleExpand,
  expandedPaths,
  onToggleExpandDeep,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: TreeNodeProps) {
  const vaultService = useService(VaultService);
  const uiService = useUIService();
  const navigate = useNavigate();
  const isFolder = node.type === 'folder';
  const nodeIsSelected = vaultService.activeFile === node.path;

  // Check if this node or any children are expanded
  const hasExpandedDescendant = expandedPaths?.has(node.path) || false;

  const handleClick = () => {
    if (isFolder) {
      onToggleExpand?.();
    } else {
      vaultService.setActiveFile(node.path);
      navigate(`/editor/${encodeURIComponent(node.path)}`);
    }
  };

  const handleDoubleClick = () => {
    if (node.type === 'file') {
      vaultService.setActiveFile(node.path);
      uiService.openTab(node.path, node.name.replace(/\.md$/i, ''));
    }
  };

  const handleNewFile = (parentPath: string) => {
    onNewFile?.(parentPath);
  };

  const handleNewFolder = (parentPath: string) => {
    onNewFolder?.(parentPath);
  };

  const handleRename = (n: TreeNodeType) => {
    onRename?.(n);
  };

  const handleDelete = (n: TreeNodeType) => {
    onDelete?.(n);
  };

  // 渲染节点按钮内容
  const nodeContent = (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`tree-node-button flex items-center gap-1 w-full px-2 py-1 rounded text-left transition-colors ${nodeIsSelected ? 'is-selected' : ''}`}
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
      {isFolder ? (
        <Folder size={14} className="text-muted-foreground" />
      ) : (
        <File size={14} className="text-muted-foreground" />
      )}
      <span className="truncate text-sm">{node.name.replace(/\.md$/i, '')}</span>
    </button>
  );

  return (
    <div className="tree-node relative">
      {/* 使用 Radix UI Context Menu 包裹节点 */}
      <TreeNodeContextMenu
        node={node}
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onRename={handleRename}
        onDelete={handleDelete}
      >
        {nodeContent}
      </TreeNodeContextMenu>

      {/* 子节点 */}
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
              onNewFile={onNewFile}
              onNewFolder={onNewFolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
