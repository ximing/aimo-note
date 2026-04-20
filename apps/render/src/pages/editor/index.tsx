import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useEffect, useState, useCallback, useRef } from 'react';
import { bindServices, observer, useService } from '@rabjs/react';
import { MilkdownEditor, FrontmatterPanel } from '../../components/editor';
import { EditorService } from '../../services/editor.service';
import { useVaultService } from '@/services/vault.service';
import { useUIService } from '@/services/ui.service';
import { ContextMenu } from '@/components/common/ContextMenu';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PromptDialog } from '@/components/common/PromptDialog';
import { vault } from '@/ipc/vault';
import type { TreeNode } from '@/ipc/vault';

const EditorPageContent = observer(() => {
  const { path = '' } = useParams<{ path: string }>();
  const navigate = useNavigate();
  const service = useService(EditorService);
  const vaultService = useVaultService();
  const uiService = useUIService();
  const [searchParams] = useSearchParams();
  const highlightQuery = searchParams.get('highlight') || '';
  const lineParam = searchParams.get('line');
  const targetLine = lineParam ? Number.parseInt(lineParam, 10) : undefined;
  const editorRef = useRef<{ dom: HTMLElement | null }>({ dom: null });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [newFileDialog, setNewFileDialog] = useState(false);
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [renameDialog, setRenameDialog] = useState<{ node: TreeNode } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ node: TreeNode } | null>(null);
  const [fileName, setFileName] = useState('');
  const [, setIsEditingFileName] = useState(false);

  useEffect(() => {
    // Initialize editor service - restores current note if path not provided
    if (!path) {
      service.initialize();
    }
  }, [path, service]);

  useEffect(() => {
    if (!path) return;

    let cancelled = false;

    const openNoteWhenReady = async () => {
      // If vault is already open, open note immediately
      if (vaultService.path) {
        console.log('[EditorPage] Vault ready, opening note:', path);
        await service.openNote(path);
        uiService.openTab(path, path.split('/').pop() || 'Untitled');
        return;
      }
      // Otherwise wait for vault to open (max 5 seconds)
      let attempts = 0;
      while (!cancelled && !vaultService.path && attempts < 100) {
        await new Promise((r) => setTimeout(r, 50));
        attempts++;
      }
      if (!cancelled && vaultService.path) {
        console.log('[EditorPage] Vault became ready, opening note:', path);
        await service.openNote(path);
        uiService.openTab(path, path.split('/').pop() || 'Untitled');
      }
    };

    openNoteWhenReady();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, service]);

  // React to tab changes
  useEffect(() => {
    const activeTab = uiService.tabs.find((t) => t.id === uiService.activeTabId);
    if (activeTab && activeTab.path !== service.currentNote?.path) {
      service.openNote(activeTab.path);
    }
  }, [uiService.activeTabId, uiService.tabs, service]);

  // Update file name when current note changes
  useEffect(() => {
    if (service.currentNote) {
      const name = service.currentNote.path.split('/').pop() || '';
      setFileName(name.replace(/\.md$/, ''));
    }
  }, [service.currentNote, service.currentNote?.path]);

  // Sync title changes from frontmatter to filename input
  useEffect(() => {
    const handleFrontmatterChanged = (frontmatter: Record<string, unknown>) => {
      const title = frontmatter.title as string | undefined;
      if (title && title !== fileName) {
        setFileName(title);
      }
    };
    service.on('frontmatterChanged', handleFrontmatterChanged);
    return () => {
      service.off('frontmatterChanged', handleFrontmatterChanged);
    };
  }, [service, fileName]);

  const handleFileNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFileName(e.target.value);
  }, []);

  const handleFileNameBlur = useCallback(async () => {
    setIsEditingFileName(false);
    if (!service.currentNote || !fileName.trim()) return;

    const oldPath = service.currentNote.path;
    const oldName = oldPath.split('/').pop() || '';
    const newName = fileName.trim().endsWith('.md') ? fileName.trim() : `${fileName.trim()}.md`;

    if (newName === oldName) return;

    const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = `${parentPath}/${newName}`;

    try {
      await vault.rename(vaultService.path!, oldPath, newPath);
      await vaultService.refreshTree();

      // Update editor state with new path
      service.currentNote = { ...service.currentNote, path: newPath };

      // Update tab
      const tab = uiService.tabs.find((t) => t.path === oldPath);
      if (tab) {
        tab.path = newPath;
        tab.title = newName;
        uiService.tabs = [...uiService.tabs];
        uiService.vaultService.saveTabs(uiService.tabs, uiService.activeTabId);
      }

      // Update URL
      navigate(`/editor/${encodeURIComponent(newPath)}`, { replace: true });

      // Sync filename to frontmatter title
      service.updateFrontmatter({ ...service.getFrontmatter(), title: fileName.trim() });
    } catch (error) {
      console.error('Failed to rename file:', error);
      // Restore old name on error
      setFileName(oldName.replace(/\.md$/, ''));
    }
  }, [fileName, service, vaultService, uiService, navigate]);

  const handleFileNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      } else if (e.key === 'Escape') {
        setIsEditingFileName(false);
        if (service.currentNote) {
          const name = service.currentNote.path.split('/').pop() || '';
          setFileName(name.replace(/\.md$/, ''));
        }
      }
    },
    [service.currentNote]
  );

  const handleChange = useCallback(
    (markdown: string) => {
      service.updateContent(markdown);
    },
    [service]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target;
    const editorDom = editorRef.current.dom;

    if (target instanceof Node && editorDom?.contains(target)) {
      return;
    }

    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleNewFile = useCallback(() => {
    setNewFileDialog(true);
  }, []);

  const handleConfirmNewFile = useCallback(
    async (name: string) => {
      setNewFileDialog(false);
      if (name) {
        const vaultPath = vaultService.vaultPath;
        if (vaultPath) {
          const fileName = name.endsWith('.md') ? name : `${name}.md`;
          await vaultService.createNote('', fileName);
          navigate(`/editor/${encodeURIComponent(fileName)}`);
        }
      }
    },
    [vaultService, navigate]
  );

  const handleNewFolder = useCallback(() => {
    setNewFolderDialog(true);
  }, []);

  const handleConfirmNewFolder = useCallback(
    async (name: string) => {
      setNewFolderDialog(false);
      if (name) {
        await vaultService.createFolder('', name);
      }
    },
    [vaultService]
  );

  const handleRename = useCallback((node: TreeNode) => {
    setRenameDialog({ node });
  }, []);

  const handleConfirmRename = useCallback(
    async (newName: string) => {
      setRenameDialog(null);
      if (renameDialog && newName && newName !== renameDialog.node.name) {
        await vaultService.renameNode(renameDialog.node, newName);
      }
    },
    [vaultService, renameDialog]
  );

  const handleDelete = useCallback((node: TreeNode) => {
    setDeleteDialog({ node });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (deleteDialog) {
      await vaultService.deleteNode(deleteDialog.node);
      setDeleteDialog(null);
    }
  }, [vaultService, deleteDialog]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div className="editor-page h-full flex flex-col">
      {/* File Name Input */}
      {service.currentNote && (
        <div className="file-name-header">
          <input
            type="text"
            value={fileName}
            onChange={handleFileNameChange}
            onFocus={() => setIsEditingFileName(true)}
            onBlur={handleFileNameBlur}
            onKeyDown={handleFileNameKeyDown}
            className="file-name-input w-full font-semibold bg-transparent border-none outline-none"
            placeholder="Untitled"
          />
        </div>
      )}
      {service.currentNote && <FrontmatterPanel />}
      <div className="editor-content flex-1 overflow-auto" onContextMenu={handleContextMenu}>
        <MilkdownEditor
          key={service.currentNote?.path || 'empty'}
          onChange={handleChange}
          defaultValue={service.content || '# New Note'}
          highlightQuery={highlightQuery}
          targetLine={
            Number.isFinite(targetLine) && targetLine && targetLine > 0 ? targetLine : undefined
          }
          editorRef={editorRef}
        />
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
      {renameDialog && (
        <PromptDialog
          title="Rename"
          defaultValue={renameDialog.node.name}
          placeholder="Enter new name"
          onConfirm={handleConfirmRename}
          onCancel={() => setRenameDialog(null)}
        />
      )}
      {deleteDialog && (
        <ConfirmDialog
          title="Delete"
          message={`Delete "${deleteDialog.node.name}"? This cannot be undone.`}
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteDialog(null)}
        />
      )}
    </div>
  );
});

export const EditorPage = bindServices(EditorPageContent, [EditorService]);
