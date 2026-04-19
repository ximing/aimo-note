import { observer, useService } from '@rabjs/react';
import { useNavigate } from 'react-router';
import { UIService } from '@/services/ui.service';
import { GitBranch, Settings } from 'lucide-react';

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

  return (
    <aside className="left-rail w-12 flex flex-col items-center pt-12 py-2 gap-1">
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
