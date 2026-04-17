import { FilePlus, FolderPlus, ArrowUpDown, ChevronsUpDown } from 'lucide-react';

interface SidebarHeaderProps {
  onNewFile: () => void;
  onNewFolder: () => void;
  sortOrder: 'asc' | 'desc';
  onSortChange: (order: 'asc' | 'desc') => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function SidebarHeader({
  onNewFile,
  onNewFolder,
  sortOrder,
  onSortChange,
  onExpandAll,
  onCollapseAll,
}: SidebarHeaderProps) {
  return (
    <div className="sidebar-header flex items-center gap-1 px-2 py-2 border-b border-border">
      <button
        type="button"
        onClick={onNewFile}
        className="p-1.5 hover:bg-accent rounded text-sm"
        title="New File"
      >
        <FilePlus size={16} />
      </button>
      <button
        type="button"
        onClick={onNewFolder}
        className="p-1.5 hover:bg-accent rounded text-sm"
        title="New Folder"
      >
        <FolderPlus size={16} />
      </button>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => onSortChange(sortOrder === 'asc' ? 'desc' : 'asc')}
        className="p-1.5 hover:bg-accent rounded text-sm"
        title={`Sort: ${sortOrder === 'asc' ? 'A-Z' : 'Z-A'}`}
      >
        <ArrowUpDown size={16} />
      </button>
      <button
        type="button"
        onClick={onExpandAll}
        className="p-1.5 hover:bg-accent rounded text-sm"
        title="Expand All"
      >
        <ChevronsUpDown size={16} />
      </button>
      <button
        type="button"
        onClick={onCollapseAll}
        className="p-1.5 hover:bg-accent rounded text-sm"
        title="Collapse All"
      >
        <ChevronsUpDown size={16} className="rotate-180" />
      </button>
    </div>
  );
}
