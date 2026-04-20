import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';
import { X, Link, List, Tag } from 'lucide-react';

const panelTabs = [
  { id: 'backlinks', icon: Link, label: 'Backlinks' },
  { id: 'outline', icon: List, label: 'Outline' },
  { id: 'tags', icon: Tag, label: 'Tags' },
] as const;

export const SidePanel = observer(() => {
  const uiService = useService(UIService);

  if (!uiService.sidePanelOpen) return null;

  return (
    <aside
      className="side-panel flex flex-col bg-bg-secondary"
      style={{ width: uiService.sidePanelWidth }}
    >
      <div className="side-panel-header flex items-center justify-between px-3 py-2 bg-bg-tertiary">
        <div className="flex items-center gap-1">
          {panelTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={`p-1.5 rounded text-sm ${
                  uiService.activeSidePanelTab === tab.id
                    ? 'bg-accent text-white'
                    : 'hover:bg-accent hover:text-white'
                }`}
                title={tab.label}
                onClick={() => {
                  uiService.activeSidePanelTab = tab.id;
                }}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="p-1 hover:bg-accent hover:text-white rounded"
          onClick={() => uiService.toggleSidePanel()}
        >
          <X size={16} />
        </button>
      </div>
      <div className="side-panel-content flex-1 overflow-auto p-3">
        {/* Panel content based on active tab */}
        {uiService.activeSidePanelTab === 'backlinks' && (
          <div className="text-sm text-text-secondary">No backlinks yet</div>
        )}
        {uiService.activeSidePanelTab === 'outline' && (
          <div className="text-sm text-text-secondary">No outline available</div>
        )}
        {uiService.activeSidePanelTab === 'tags' && (
          <div className="text-sm text-text-secondary">No tags found</div>
        )}
      </div>
    </aside>
  );
});
