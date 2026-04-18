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
      <div className="title-bar flex items-center justify-between px-3 py-1 border-b bg-bg-secondary">
        {/* Spacer to balance Title Bar Actions on the right */}
        <div className="flex-1" />

        {/* Title Bar Actions - icons next to traffic lights area */}
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

          {/* Page Content */}
          <div className="page-content flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>

        {/* Side Panel */}
        <SidePanel />
      </div>
    </div>
  );
});
