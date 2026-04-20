import { observer, useService } from '@rabjs/react';
import { useNavigate } from 'react-router';
import { UIService } from '@/services/ui.service';
import { GitBranch, Settings, FolderTree, Search } from 'lucide-react';

type NavItem = {
  id: string;
  icon: typeof GitBranch;
  label: string;
  path?: string;
  isModal?: boolean;
};

const navItems: NavItem[] = [
  { id: 'graph', icon: GitBranch, label: '图谱', path: '/graph' },
  { id: 'settings', icon: Settings, label: '设置', isModal: true },
];

export const LeftRail = observer(() => {
  const navigate = useNavigate();
  const uiService = useService(UIService);

  if (!uiService.leftRailOpen) return null;

  const sidebarItems = [
    { id: 'tree', icon: FolderTree, label: '目录树', view: 'tree' as const },
    { id: 'search', icon: Search, label: '搜索', view: 'search' as const },
  ];

  return (
    <aside className="left-rail w-12 flex flex-col items-center py-2 gap-1">
      {sidebarItems.map((item) => {
        const Icon = item.icon;
        const isActive = uiService.sidebarView === item.view;
        return (
          <button
            key={item.id}
            type="button"
            className={`rail-nav-button p-2 rounded-full text-gray-400 transition-colors ${isActive ? 'is-active' : ''}`}
            title={item.label}
            onClick={() => {
              if (!uiService.leftSidebarOpen) {
                uiService.toggleLeftSidebar();
              }
              uiService.setSidebarView(item.view);
            }}
          >
            <Icon size={20} />
          </button>
        );
      })}

      <div className="my-1 h-px w-6 bg-[var(--border-subtle)]" />

      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className="rail-nav-button p-2 rounded-full text-gray-400 transition-colors"
            title={item.label}
            onClick={() => {
              if (item.isModal) {
                uiService.settingsModalOpen = true;
              } else if (item.path) {
                navigate(item.path);
              }
            }}
          >
            <Icon size={20} />
          </button>
        );
      })}
    </aside>
  );
});
