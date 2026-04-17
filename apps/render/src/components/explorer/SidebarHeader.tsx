import { useState, useRef, useEffect } from 'react';
import { FilePlus, FolderPlus, ChevronsUpDown, Check, SortAsc, SortDesc, Calendar, Clock } from 'lucide-react';

export type SortOption = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc' | 'modified-desc' | 'modified-asc';

const sortOptions: { value: SortOption; label: string; icon: typeof SortAsc; disabled?: boolean }[] = [
  { value: 'name-asc', label: '按文件名 A-Z', icon: SortAsc },
  { value: 'name-desc', label: '按文件名 Z-A', icon: SortDesc },
  { value: 'created-desc', label: '按创建时间 ↓', icon: Calendar, disabled: true },
  { value: 'created-asc', label: '按创建时间 ↑', icon: Calendar, disabled: true },
  { value: 'modified-desc', label: '按编辑时间 ↓', icon: Clock, disabled: true },
  { value: 'modified-asc', label: '按编辑时间 ↑', icon: Clock, disabled: true },
];

interface SidebarHeaderProps {
  onNewFile: () => void;
  onNewFolder: () => void;
  sortBy: 'name' | 'created' | 'modified';
  sortOrder: 'asc' | 'desc';
  onSortChange: (sortBy: 'name' | 'created' | 'modified', sortOrder: 'asc' | 'desc') => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export function SidebarHeader({
  onNewFile,
  onNewFolder,
  sortBy,
  sortOrder,
  onSortChange,
  onExpandAll,
  onCollapseAll,
}: SidebarHeaderProps) {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false);
      }
    };

    if (showSortMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSortMenu]);

  const currentSortOption = `${sortBy}-${sortOrder}` as SortOption;
  const currentOption = sortOptions.find((opt) => opt.value === currentSortOption);

  const handleSortSelect = (value: SortOption, disabled?: boolean) => {
    if (disabled) return;
    const [newSortBy, newSortOrder] = value.split('-') as ['name' | 'created' | 'modified', 'asc' | 'desc'];
    onSortChange(newSortBy, newSortOrder);
    setShowSortMenu(false);
  };

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

      {/* Sort dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setShowSortMenu(!showSortMenu)}
          className="p-1.5 hover:bg-accent rounded text-sm flex items-center gap-1"
          title="Sort"
        >
          <currentOption.icon size={14} className="mr-1" />
          <ChevronsUpDown size={16} />
        </button>

        {showSortMenu && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-bg-primary border border-border rounded-md shadow-lg z-50 py-1">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSortSelect(option.value, option.disabled)}
                disabled={option.disabled}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-accent flex items-center justify-between ${option.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={option.disabled ? '即将支持' : option.label}
              >
                <span>
                  <option.icon size={14} className="mr-2 inline" />
                  {option.label}
                </span>
                {currentSortOption === option.value && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>

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
