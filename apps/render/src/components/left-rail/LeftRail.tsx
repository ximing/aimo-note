import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';
import { Search, FileText, GitBranch, Settings } from 'lucide-react';

const navItems = [
  { id: 'search', icon: Search, label: '搜索', path: '/search' },
  { id: 'files', icon: FileText, label: '文件', path: '/editor' },
  { id: 'graph', icon: GitBranch, label: '图谱', path: '/graph' },
  { id: 'settings', icon: Settings, label: '设置', path: '/settings' },
];

export const LeftRail = observer(() => {
  const uiService = useService(UIService);

  if (!uiService.leftRailOpen) return null;

  return (
    <aside className="left-rail w-12 border-r flex flex-col items-center py-2 gap-1 bg-bg-secondary">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className="p-2 hover:bg-accent hover:text-white rounded text-gray-400 transition-colors"
            title={item.label}
            onClick={() => {
              if (item.path.startsWith('/editor')) {
                // Special handling for editor - open in tab
                uiService.openTab('', 'New Note');
              }
              window.location.href = item.path;
            }}
          >
            <Icon size={20} />
          </button>
        );
      })}
    </aside>
  );
});
