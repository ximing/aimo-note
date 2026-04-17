import { useState, useCallback } from 'react';
import { observer, useService } from '@rabjs/react';
import { TreeNode } from './TreeNode';
import { SidebarHeader } from './SidebarHeader';
import { VaultService } from '@/services/vault.service';

export const VaultTree = observer(() => {
  const vaultService = useService(VaultService);
  const { tree, path } = vaultService;
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const toggleExpanded = useCallback((nodePath: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(nodePath)) {
        next.delete(nodePath);
      } else {
        next.add(nodePath);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    const allFolderPaths = new Set<string>();
    const collectPaths = (nodes: typeof tree) => {
      for (const node of nodes) {
        if (node.type === 'folder') {
          allFolderPaths.add(node.path);
          if (node.children) {
            collectPaths(node.children);
          }
        }
      }
    };
    collectPaths(tree);
    setExpandedPaths(allFolderPaths);
  }, [tree]);

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const handleSortChange = useCallback((order: 'asc' | 'desc') => {
    setSortOrder(order);
  }, []);

  const handleNewFile = useCallback(() => {
    const name = window.prompt('Enter file name:', 'untitled.md');
    if (name) {
      vaultService.createNote('', name);
    }
  }, [vaultService]);

  const handleNewFolder = useCallback(() => {
    const name = window.prompt('Enter folder name:', 'new-folder');
    if (name) {
      vaultService.createFolder('', name);
    }
  }, [vaultService]);

  if (!path) {
    return (
      <div className="vault-tree p-4 text-center text-muted-foreground">
        No vault open
      </div>
    );
  }

  // Sort tree
  const sortedTree = [...tree].sort((a, b) => {
    // Folders always first
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return sortOrder === 'asc'
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name);
  });

  return (
    <div className="vault-tree flex flex-col h-full">
      <SidebarHeader
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
      />
      <div className="flex-1 overflow-auto py-1">
        {sortedTree.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Vault is empty
          </div>
        ) : (
          sortedTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              isExpanded={expandedPaths.has(node.path)}
              onToggleExpand={() => toggleExpanded(node.path)}
              expandedPaths={expandedPaths}
              onToggleExpandDeep={toggleExpanded}
            />
          ))
        )}
      </div>
    </div>
  );
});
