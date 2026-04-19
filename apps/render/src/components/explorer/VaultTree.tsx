import { useState, useCallback } from 'react';
import { observer, useService } from '@rabjs/react';
import type { TreeNode as TreeNodeType } from '@/ipc/vault';
import { TreeNode } from './TreeNode';
import { SidebarHeader } from './SidebarHeader';
import { PromptDialog, ConfirmDialog } from '@/components/common';
import { VaultService } from '@/services/vault.service';

interface DialogState {
  type: 'newFile' | 'newFolder' | 'rename' | 'delete' | null;
  parentPath?: string;
  node?: TreeNodeType;
}

export const VaultTree = observer(() => {
  const vaultService = useService(VaultService);
  const { tree, path } = vaultService;
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'modified'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [dialog, setDialog] = useState<DialogState>({ type: null });

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

  const handleSortChange = useCallback((newSortBy: 'name' | 'created' | 'modified', newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
  }, []);

  const handleNewFile = useCallback((parentPath = '') => {
    setDialog({ type: 'newFile', parentPath });
  }, []);

  const handleNewFolder = useCallback((parentPath = '') => {
    setDialog({ type: 'newFolder', parentPath });
  }, []);

  const handleRename = useCallback((node: TreeNodeType) => {
    setDialog({ type: 'rename', node });
  }, []);

  const handleDelete = useCallback((node: TreeNodeType) => {
    setDialog({ type: 'delete', node });
  }, []);

  const handleDialogConfirm = useCallback(
    (value: string) => {
      const cleanName = value.replace(/\.md$/i, '').trim();
      if (!cleanName) return;

      if (dialog.type === 'newFile') {
        vaultService.createNote(dialog.parentPath || '', cleanName);
      } else if (dialog.type === 'newFolder') {
        vaultService.createFolder(dialog.parentPath || '', cleanName);
      } else if (dialog.type === 'rename' && dialog.node) {
        vaultService.renameNode(dialog.node, cleanName);
      }
      setDialog({ type: null });
    },
    [dialog, vaultService]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (dialog.type === 'delete' && dialog.node) {
      vaultService.deleteNode(dialog.node);
    }
    setDialog({ type: null });
  }, [dialog, vaultService]);

  if (!path) {
    return (
      <div className="vault-tree p-4 text-center text-muted-foreground">
        No vault open
      </div>
    );
  }

  // Sort tree, filtering out .aimo-note config directory
  const sortedTree = [...tree]
    .filter(node => node.name !== '.aimo-note')
    .sort((a, b) => {
    // Folders always first
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;

    let comparison = 0;
    if (sortBy === 'name') {
      const nameA = a.name.replace(/\.md$/i, '');
      const nameB = b.name.replace(/\.md$/i, '');
      comparison = nameA.localeCompare(nameB);
    }
    // created/modified would need timestamps - not implemented yet

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="vault-tree flex flex-col h-full">
      <SidebarHeader
        onNewFile={() => handleNewFile('')}
        onNewFolder={() => handleNewFolder('')}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
      />
      <div className="left-sidebar-content flex-1 overflow-auto py-1">
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
              onNewFile={handleNewFile}
              onNewFolder={handleNewFolder}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {dialog.type === 'newFile' && (
        <PromptDialog
          title="新建文件"
          defaultValue="untitled"
          placeholder="输入文件名"
          cancelText="取消"
          confirmText="创建"
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialog({ type: null })}
        />
      )}
      {dialog.type === 'newFolder' && (
        <PromptDialog
          title="新建文件夹"
          defaultValue="new-folder"
          placeholder="输入文件夹名"
          cancelText="取消"
          confirmText="创建"
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialog({ type: null })}
        />
      )}
      {dialog.type === 'rename' && dialog.node && (
        <PromptDialog
          title="重命名"
          defaultValue={dialog.node.name.replace(/\.md$/i, '')}
          placeholder="输入新名称"
          cancelText="取消"
          confirmText="确定"
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialog({ type: null })}
        />
      )}
      {dialog.type === 'delete' && dialog.node && (
        <ConfirmDialog
          title="删除"
          message={`确定要删除 "${dialog.node.name.replace(/\.md$/i, '')}" 吗？`}
          confirmText="删除"
          danger
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDialog({ type: null })}
        />
      )}
    </div>
  );
});
