import { Outlet } from 'react-router';
import { observer } from '@rabjs/react';
import { useUIService } from '@/services/ui.service';
import { LeftRail } from './left-rail';
import { TitleBarActions } from './titlebar-actions';
import { EditorTabs } from './editor-tabs';
import { SidePanel } from './side-panel';
import { VaultTree } from './explorer/VaultTree';

export const Layout = observer(() => {
  const uiService = useUIService();

  return (
    <div className="app-layout h-screen flex flex-col">
      {/* Title Bar Row - Electron handles native traffic lights */}
      <div className="title-bar flex items-center px-3 py-1 border-b bg-bg-secondary">
        {/* Title Bar Actions - icons immediately to the right of traffic lights area */}
        <TitleBarActions />
      </div>

      {/* Main Content Area */}
      <div className="main-area flex flex-1 overflow-hidden">
        {/* Left Rail */}
        <LeftRail />

        {/* Explorer (File Tree) */}
        {uiService.explorerOpen && (
          <aside className="explorer w-64 border-r flex flex-col bg-bg-primary">
            <VaultTree />
          </aside>
        )}

        {/* Main Content */}
        <main className="main-content flex-1 flex flex-col overflow-hidden">
          {/* Editor Tabs */}
          <EditorTabs />

          {/* Document Editor Container */}
          <div className="editor-container flex-1 border m-2 rounded-md overflow-hidden">
            <div className="page-content flex-1 overflow-hidden">
              <Outlet />
            </div>
          </div>
        </main>

        {/* Side Panel */}
        <SidePanel />
      </div>
    </div>
  );
});
