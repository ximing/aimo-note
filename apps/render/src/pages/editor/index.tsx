import { useParams } from 'react-router';
import { MilkdownEditor } from '../../components/editor/MilkdownEditor';
import { EditorStatus } from '../../components/editor/EditorStatus';

export function EditorPage() {
  const { path } = useParams<{ path: string }>();

  const handleChange = (markdown: string) => {
    console.log('Content changed:', markdown);
    // TODO: Save to vault via vault service
  };

  return (
    <div className="editor-page h-full flex flex-col">
      <div className="editor-toolbar border-b p-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">{path || 'New Note'}</span>
        <EditorStatus />
      </div>
      <div className="editor-content flex-1 overflow-auto">
        <MilkdownEditor onChange={handleChange} defaultValue="# New Note" />
      </div>
    </div>
  );
}
