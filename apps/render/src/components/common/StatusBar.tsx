import { observer } from '@rabjs/react';
import { useInstance } from '@milkdown/react';
import { getMarkdown } from '@milkdown/kit/utils';
import { useState, useEffect } from 'react';

export const StatusBar = observer(() => {
  const [loading, getEditor] = useInstance();
  const [stats, setStats] = useState({ words: 0, characters: 0 });

  useEffect(() => {
    if (typeof getEditor !== 'function') return;

    const interval = setInterval(() => {
      try {
        const editor = getEditor();
        if (editor) {
          const markdown = editor.action(getMarkdown());
          if (typeof markdown === 'string') {
            const text = markdown.replace(/[#*`[\]]/g, '').trim();
            const words = text.split(/\s+/).filter((w) => w.length > 0).length;
            setStats({
              words,
              characters: text.length,
            });
          }
        }
      } catch {
        // Editor not ready yet
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [getEditor]);

  return (
    <div className="status-bar flex items-center justify-between px-4 py-1 bg-bg-secondary text-xs text-gray-500 border-t border-border-light">
      <div className="flex items-center gap-4">
        <span>{loading ? '...' : `${stats.words} words`}</span>
        <span>{stats.characters} characters</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Reserved for additional status info */}
      </div>
    </div>
  );
});
