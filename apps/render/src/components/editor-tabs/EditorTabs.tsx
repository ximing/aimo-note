import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';
import { X } from 'lucide-react';

export const EditorTabs = observer(() => {
  const uiService = useService(UIService);

  if (!uiService.tabs.length) return null;

  return (
    <div className="editor-tabs flex items-center border-b bg-bg-secondary overflow-x-auto">
      {uiService.tabs.map((tab) => (
        <div
          key={tab.id}
          className={`editor-tab flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer hover:bg-bg-tertiary ${
            uiService.activeTabId === tab.id ? 'bg-bg-primary border-b-2 border-b-accent' : ''
          }`}
          onClick={() => {
            uiService.setActiveTab(tab.id);
          }}
          onDoubleClick={() => {
            // Double click does nothing additional for now
          }}
        >
          <span className="text-sm truncate max-w-32">{tab.title || 'Untitled'}</span>
          <button
            type="button"
            className="p-0.5 hover:bg-accent hover:text-white rounded"
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
