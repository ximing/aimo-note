import { observer, useService } from '@rabjs/react';
import { X, Sun, Moon, Monitor } from 'lucide-react';
import { UIService } from '@/services/ui.service';

type Theme = 'light' | 'dark' | 'system';

const settingsCategories = [
  { id: 'appearance', label: '外观' },
  { id: 'editor', label: '编辑器' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'about', label: '关于' },
];

export const SettingsModal = observer(() => {
  const uiService = useService(UIService);

  const handleClose = () => {
    uiService.settingsModalOpen = false;
  };

  const handleThemeChange = (theme: Theme) => {
    uiService.setTheme(theme);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-[800px] h-[600px] bg-bg-primary rounded-md shadow-lg flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 bg-bg-tertiary">
          <div className="p-4 bg-bg-secondary">
            <h2 className="text-sm font-semibold text-text-primary">设置</h2>
          </div>
          <nav className="p-2">
            {settingsCategories.map((cat) => (
              <button
                key={cat.id}
                className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-tertiary rounded cursor-pointer"
              >
                {cat.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between p-4 bg-bg-secondary">
            <h3 className="text-sm font-semibold text-text-primary">外观</h3>
            <button
              type="button"
              className="p-1 hover:bg-bg-tertiary rounded"
              onClick={handleClose}
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {/* Theme Section */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-text-primary mb-3">主题</h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    uiService.theme === 'light'
                      ? 'bg-accent text-white'
                      : 'hover:bg-bg-quaternary'
                  }`}
                  onClick={() => handleThemeChange('light')}
                >
                  <Sun size={16} />
                  <span className="text-sm">浅色</span>
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    uiService.theme === 'dark'
                      ? 'bg-accent text-white'
                      : 'hover:bg-bg-quaternary'
                  }`}
                  onClick={() => handleThemeChange('dark')}
                >
                  <Moon size={16} />
                  <span className="text-sm">深色</span>
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    uiService.theme === 'system'
                      ? 'bg-accent text-white'
                      : 'hover:bg-bg-quaternary'
                  }`}
                  onClick={() => handleThemeChange('system')}
                >
                  <Monitor size={16} />
                  <span className="text-sm">跟随系统</span>
                </button>
              </div>
            </div>

            {/* About Section */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-text-primary mb-3">关于</h4>
              <div className="text-sm text-text-secondary">
                <p className="mb-1">AIMO Note v0.9.5</p>
                <p className="text-text-muted">一个本地优先的笔记应用</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
