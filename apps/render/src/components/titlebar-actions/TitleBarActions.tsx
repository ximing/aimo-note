import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';
import { Search, FolderTree, PanelLeftClose } from 'lucide-react';

export const TitleBarActions = observer(() => {
  const uiService = useService(UIService);

  if (!uiService.titleBarActionsOpen) return null;

  return (
    <div className="titlebar-actions flex items-center gap-1">
      <button
        type="button"
        className="p-1.5 hover:bg-accent hover:text-white rounded text-sm"
        title="搜索"
        onClick={() => {
          uiService.setSidebarView('search');
        }}
      >
        <Search size={16} />
      </button>
      <button
        type="button"
        className="p-1.5 hover:bg-accent hover:text-white rounded text-sm"
        title="文件树"
        onClick={() => {
          uiService.toggleLeftSidebar();
        }}
      >
        <FolderTree size={16} />
      </button>
      {/* Collapse Explorer */}
      <button
        type="button"
        className="p-1.5 hover:bg-accent hover:text-white rounded text-sm"
        title="收起目录树"
        onClick={() => {
          if (uiService.leftSidebarOpen) {
            uiService.toggleLeftSidebar();
          }
        }}
      >
        <PanelLeftClose size={16} />
      </button>
    </div>
  );
});
