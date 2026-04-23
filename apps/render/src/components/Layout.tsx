import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { observer } from '@rabjs/react';
import { useUIService } from '@/services/ui.service';
import { useVaultService } from '@/services/vault.service';
import { LeftRail } from './left-rail';
import { EditorTabs } from './editor-tabs';
import { SidePanel } from './side-panel';
import { VaultTree } from './explorer/VaultTree';
import { SearchPanel } from './left-sidebar/SearchPanel';
import { SettingsModal } from './common/SettingsModal';
import { StatusBar } from './common/StatusBar';
import { ResizeHandle } from './common/ResizeHandle';
import { PanelLeftClose, PanelLeft, Clock, RefreshCw, Camera } from 'lucide-react';
import { ConflictBanner, ConflictListPanel, HistoryPanel, DiagnosticsPanel, SnapshotPanel } from './conflicts';

export const Layout = observer(() => {
  const uiService = useUIService();
  const vaultService = useVaultService();
  const [showConflictList, setShowConflictList] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showSnapshot, setShowSnapshot] = useState(false);

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
          <div className="header-row pl-16 flex items-center px-3 py-1">
            <div className="ml-auto flex items-center">
              {uiService.leftSidebarOpen ? (
                <button
                  type="button"
                  className="chrome-icon-button p-1.5 rounded text-sm"
                  title="收起目录树"
                  onClick={() => uiService.toggleLeftSidebar()}
                >
                  <PanelLeftClose size={16} />
                </button>
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
          </div>

          {/* Content Area */}
          <div className="content-area flex flex-1 overflow-hidden">
            {/* Left Rail */}
            <LeftRail />

            {/* Left Sidebar (File Tree, Search, Tags, etc.) */}
            {uiService.leftSidebarOpen && (
              <>
                <aside
                  className="left-sidebar flex flex-col"
                  style={{ width: uiService.leftSidebarWidth }}
                >
                  {uiService.sidebarView === 'tree' ? <VaultTree /> : <SearchPanel />}
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

      {/* Conflict Banner */}
      <ConflictBanner onClick={() => setShowConflictList(true)} />

      {/* History Button - shown when a file is open */}
      {vaultService.currentNotePath && (
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="fixed bottom-12 right-4 z-40 flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full text-sm shadow-md transition-colors"
          title="View revision history"
        >
          <Clock size={14} />
          History
        </button>
      )}

      {/* Status Bar */}
      <StatusBar />

      {/* Settings Modal */}
      {uiService.settingsModalOpen && <SettingsModal />}

      {/* Conflict List Modal */}
      {showConflictList && <ConflictListPanel onClose={() => setShowConflictList(false)} />}

      {/* History Modal - shown when a file is open */}
      {showHistory && vaultService.currentNotePath && (
        <HistoryPanel
          filePath={vaultService.currentNotePath}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Diagnostics Modal - shown when triggered */}
      {showDiagnostics && <DiagnosticsPanel onClose={() => setShowDiagnostics(false)} />}

      {/* Diagnostics trigger button - small floating button */}
      <button
        type="button"
        onClick={() => setShowDiagnostics(true)}
        className="fixed bottom-12 left-4 z-40 flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full text-sm shadow-md transition-colors"
        title="Sync Diagnostics"
      >
        <RefreshCw size={14} />
        Diagnostics
      </button>

      {/* Snapshot trigger button - shown when sync is enabled */}
      <button
        type="button"
        onClick={() => setShowSnapshot(true)}
        className="fixed bottom-12 right-20 z-40 flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-full text-sm shadow-md transition-colors"
        title="Vault Snapshots"
      >
        <Camera size={14} />
        Snapshots
      </button>

      {/* Snapshot Modal */}
      {showSnapshot && <SnapshotPanel onClose={() => setShowSnapshot(false)} />}
    </div>
  );
});
