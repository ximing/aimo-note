import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';
import { X } from 'lucide-react';

export const EditorTabs = observer(() => {
  const uiService = useService(UIService);

  if (!uiService.tabs.length) return null;

  return (
    <div
      className="editor-tabs flex items-center overflow-x-auto"
      role="tablist"
      aria-label="Document tabs"
    >
      {uiService.tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={uiService.activeTabId === tab.id}
          tabIndex={uiService.activeTabId === tab.id ? 0 : -1}
          className={`editor-tab flex items-center gap-2 px-3 py-1 cursor-pointer transition-colors ${
            uiService.activeTabId === tab.id ? 'active' : ''
          }`}
          onClick={() => uiService.setActiveTab(tab.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              uiService.setActiveTab(tab.id);
            }
          }}
        >
          <span className="text-sm truncate max-w-32">{tab.title || 'Untitled'}</span>
          <button
            type="button"
            aria-label="Close tab"
            className="tab-close-button p-0.5 rounded"
            onClick={(e) => {
              e.stopPropagation();
              uiService.closeTab(tab.id);
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
});
