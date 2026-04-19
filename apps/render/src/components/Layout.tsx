import { Outlet, useNavigate } from 'react-router';
import { observer } from '@rabjs/react';
import { useUIService } from '@/services/ui.service';
import { LeftRail } from './left-rail';
import { EditorTabs } from './editor-tabs';
import { SidePanel } from './side-panel';
import { VaultTree } from './explorer/VaultTree';
import { SettingsModal } from './common/SettingsModal';
import { StatusBar } from './common/StatusBar';
import { Search, PanelLeftClose, PanelLeft } from 'lucide-react';

export const Layout = observer(() => {
  const uiService = useUIService();
  const navigate = useNavigate();

  return (
    <div className="app-layout h-screen flex flex-col">
      {/* Main Content Area */}
      <div className="main-area flex flex-1 overflow-hidden">
        {/* Left Rail */}
        <LeftRail />

        {/* Left Sidebar (File Tree, Search, Tags, etc.) */}
        {uiService.leftSidebarOpen && (
          <aside className="left-sidebar w-64 flex flex-col bg-bg-secondary">
            {/* Left Sidebar Header - pl-12 avoids macOS traffic lights */}
            <div className="left-sidebar-header flex items-center gap-1 pl-12 px-3 py-1 bg-bg-secondary">
              <button
                type="button"
                className="p-1.5 hover:bg-accent hover:text-white rounded text-sm"
                title="搜索"
                onClick={() => navigate('/search')}
              >
                <Search size={16} />
              </button>
              <button
                type="button"
                className="p-1.5 hover:bg-accent hover:text-white rounded text-sm"
                title="收起目录树"
                onClick={() => uiService.toggleLeftSidebar()}
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            <VaultTree />
          </aside>
        )}

        {/* Main Content */}
        <main className="main-content flex-1 flex flex-col overflow-hidden">
          {/* Editor Tabs */}
          <div className="flex items-center">
            {!uiService.leftSidebarOpen && (
              <button
                type="button"
                className="p-1.5 hover:bg-accent hover:text-white rounded text-sm"
                title="展开目录树"
                onClick={() => uiService.toggleLeftSidebar()}
              >
                <PanelLeft size={16} />
              </button>
            )}
            <EditorTabs />
          </div>

          {/* Document Editor Container */}
          <div className="editor-container flex-1 flex flex-col bg-bg-primary m-2 overflow-hidden">
            <div className="page-content flex-1 overflow-hidden">
              <Outlet />
            </div>
          </div>
        </main>

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
