import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { observer } from '@rabjs/react';
import { useUIService } from '@/services/ui.service';
import { useVaultService } from '@/services/vault.service';
import { LeftRail } from './left-rail';
import { EditorTabs } from './editor-tabs';
import { SidePanel } from './side-panel';
import { VaultTree } from './explorer/VaultTree';
import { SettingsModal } from './common/SettingsModal';
import { StatusBar } from './common/StatusBar';
import { ResizeHandle } from './common/ResizeHandle';
import { Search, PanelLeftClose, PanelLeft } from 'lucide-react';

export const Layout = observer(() => {
  const uiService = useUIService();
  const vaultService = useVaultService();
  const navigate = useNavigate();

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + , to toggle settings modal
      if (e.key === ',' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (uiService.settingsModalOpen) {
          uiService.closeSettings();
        } else {
          uiService.openSettings();
        }
      }

      // Escape to close settings modal
      if (e.key === 'Escape' && uiService.settingsModalOpen) {
        e.preventDefault();
        uiService.closeSettings();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [uiService.settingsModalOpen]);

  const handleSidebarResize = (deltaX: number) => {
    uiService.setLeftSidebarWidth(uiService.leftSidebarWidth + deltaX);
  };

  const handleSidebarResizeEnd = () => {
    vaultService.saveUISettings({ leftSidebarWidth: uiService.leftSidebarWidth });
  };

  return (
    <div className="app-layout h-screen flex flex-col">
      {/* Main Content Area */}
      <div className="main-area flex flex-1 overflow-hidden">
        {/* Left Column: Header Row + Content Area */}
        <div className="left-column flex flex-col overflow-hidden">
          {/* Header Row - pl-12 avoids macOS traffic lights */}
          <div className="header-row pl-16 flex items-center gap-1 px-3 py-1">
            {uiService.leftSidebarOpen ? (
              <>
                <button
                  type="button"
                  className="chrome-icon-button p-1.5 rounded text-sm"
                  title="搜索"
                  onClick={() => navigate('/search')}
                >
                  <Search size={16} />
                </button>
                <button
                  type="button"
                  className="chrome-icon-button p-1.5 rounded text-sm"
                  title="收起目录树"
                  onClick={() => uiService.toggleLeftSidebar()}
                >
                  <PanelLeftClose size={16} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="chrome-icon-button p-1.5 rounded text-sm"
                title="展开目录树"
                onClick={() => uiService.toggleLeftSidebar()}
              >
                <PanelLeft size={16} />
              </button>
            )}
          </div>

          {/* Content Area */}
          <div className="content-area flex flex-1 overflow-hidden">
            {/* Left Rail */}
            <LeftRail />

            {/* Left Sidebar (File Tree, Search, Tags, etc.) */}
            {uiService.leftSidebarOpen && (
              <>
                <aside className="left-sidebar flex flex-col" style={{ width: uiService.leftSidebarWidth }}>
                  <VaultTree />
                </aside>
                <ResizeHandle
                  onResize={handleSidebarResize}
                  onResizeEnd={handleSidebarResizeEnd}
                  side="right"
                />
              </>
            )}
          </div>
        </div>

        {/* Right Column: Editor Tabs + Main Content */}
        <div className="right-column flex flex-col flex-1 overflow-hidden">
          {/* Editor Tabs */}
          <div className="editor-tabs-shell">
            <EditorTabs />
          </div>

          {/* Main Content */}
          <main className="main-content flex-1 flex flex-col overflow-hidden">
            {/* Document Editor Container */}
            <div className="editor-container editor-surface flex-1 flex flex-col overflow-hidden">
              <div className="page-content flex-1 overflow-hidden">
                <Outlet />
              </div>
            </div>
          </main>
        </div>

        {/* Side Panel */}
        <SidePanel />
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Settings Modal */}
      {uiService.settingsModalOpen && <SettingsModal />}
    </div>
  );
});
