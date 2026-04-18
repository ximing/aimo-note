import { useInstance } from '@milkdown/react';
import { getMarkdown } from '@milkdown/kit/utils';
import { useState, useEffect } from 'react';

export interface EditorStatusProps {
  className?: string;
}

export function EditorStatus({ className = '' }: EditorStatusProps) {
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
    <div className={`editor-status flex gap-4 text-xs text-gray-500 ${className}`}>
      <span>{loading ? '...' : `${stats.words} words`}</span>
      <span>{stats.characters} characters</span>
    </div>
  );
}
