import { useParams } from 'react-router';
import { useEffect } from 'react';
import { bindServices, observer, useService } from '@rabjs/react';
import { MilkdownEditor } from '../../components/editor/MilkdownEditor';
import { EditorStatus } from '../../components/editor/EditorStatus';
import { EditorService } from '../../services/editor.service';

const EditorPageContent = observer(() => {
  const { path = '' } = useParams<{ path: string }>();
  const service = useService(EditorService);

  useEffect(() => {
    if (path) {
      service.openNote(path);
    }
  }, [path, service]);

  const handleChange = (markdown: string) => {
    service.updateContent(markdown);
  };

  const displayPath = service.currentNote?.path || path || 'New Note';
  const saveStatus = service.isSaving
    ? 'Saving...'
    : service.isDirty
      ? 'Unsaved'
      : service.lastSaved
        ? `Saved ${service.lastSaved.toLocaleTimeString()}`
        : '';

  return (
    <div className="editor-page h-full flex flex-col">
      <div className="editor-toolbar border-b p-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">{displayPath}</span>
        <div className="flex items-center gap-2">
          {saveStatus && <span className="text-xs text-gray-400">{saveStatus}</span>}
          <EditorStatus />
        </div>
      </div>
      <div className="editor-content flex-1 overflow-auto">
        <MilkdownEditor onChange={handleChange} defaultValue={service.content || '# New Note'} />
      </div>
    </div>
  );
});

export const EditorPage = bindServices(EditorPageContent, [EditorService]);
