import { useParams, useNavigate } from 'react-router';
import { useEffect, useState, useCallback } from 'react';
import { bindServices, observer, useService } from '@rabjs/react';
import { MilkdownEditor } from '../../components/editor/MilkdownEditor';
import { EditorStatus } from '../../components/editor/EditorStatus';
import { EditorService } from '../../services/editor.service';
import { useVaultService } from '@/services/vault.service';
import { ContextMenu } from '@/components/common/ContextMenu';
import { PromptDialog } from '@/components/common/PromptDialog';
import type { TreeNode } from '@/ipc/vault';

const EditorPageContent = observer(() => {
  const { path = '' } = useParams<{ path: string }>();
  const navigate = useNavigate();
  const service = useService(EditorService);
  const vaultService = useVaultService();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [newFileDialog, setNewFileDialog] = useState(false);
  const [newFolderDialog, setNewFolderDialog] = useState(false);

  useEffect(() => {
    if (path) {
      service.openNote(path);
    }
  }, [path, service]);

  const handleChange = (markdown: string) => {
    service.updateContent(markdown);
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNewFile = useCallback(() => {
    setNewFileDialog(true);
  }, []);

  const handleConfirmNewFile = useCallback(async (name: string) => {
    setNewFileDialog(false);
    if (name) {
      const vaultPath = vaultService.vaultPath;
      if (vaultPath) {
        const fileName = name.endsWith('.md') ? name : `${name}.md`;
        await vaultService.createNote('', fileName);
        navigate(`/editor/${encodeURIComponent(fileName)}`);
      }
    }
  }, [vaultService, navigate]);

  const handleNewFolder = useCallback(() => {
    setNewFolderDialog(true);
  }, []);

  const handleConfirmNewFolder = useCallback(async (name: string) => {
    setNewFolderDialog(false);
    if (name) {
      await vaultService.createFolder('', name);
    }
  }, [vaultService]);

  const handleRename = useCallback(async (node: TreeNode) => {
    const newName = prompt('Enter new name:', node.name);
    if (newName && newName !== node.name) {
      await vaultService.renameNode(node, newName);
    }
  }, [vaultService]);

  const handleDelete = useCallback(async (node: TreeNode) => {
    const confirmed = confirm(`Delete "${node.name}"? This cannot be undone.`);
    if (confirmed) {
      await vaultService.deleteNode(node);
    }
  }, [vaultService]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const displayPath = service.currentNote?.path || path || 'New Note';
  const saveStatus = service.isSaving
    ? 'Saving...'
    : service.isDirty
      ? 'Unsaved'
      : service.lastSaved
        ? `Saved ${service.lastSaved.toLocaleTimeString()}`
        : '';

  return (
    <div className="editor-page h-full flex flex-col">
      <div className="editor-toolbar border-b p-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">{displayPath}</span>
        <div className="flex items-center gap-2">
          {saveStatus && <span className="text-xs text-gray-400">{saveStatus}</span>}
          <EditorStatus />
        </div>
      </div>
      <div
        className="editor-content flex-1 overflow-auto"
        onContextMenu={handleContextMenu}
      >
        <MilkdownEditor onChange={handleChange} defaultValue={service.content || '# New Note'} />
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={null}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onDelete={handleDelete}
          onClose={handleCloseContextMenu}
        />
      )}
      {newFileDialog && (
        <PromptDialog
          title="New File"
          defaultValue="untitled.md"
          placeholder="Enter file name"
          onConfirm={handleConfirmNewFile}
          onCancel={() => setNewFileDialog(false)}
        />
      )}
      {newFolderDialog && (
        <PromptDialog
          title="New Folder"
          defaultValue="new-folder"
          placeholder="Enter folder name"
          onConfirm={handleConfirmNewFolder}
          onCancel={() => setNewFolderDialog(false)}
        />
      )}
    </div>
  );
});

export const EditorPage = bindServices(EditorPageContent, [EditorService]);
