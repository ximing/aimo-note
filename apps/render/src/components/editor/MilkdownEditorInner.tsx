import { useEditor, useInstance } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { Milkdown } from '@milkdown/react';

export interface MilkdownEditorInnerProps {
  onChange?: (markdown: string) => void;
  defaultValue?: string;
  className?: string;
}

export function MilkdownEditorInner({
  onChange,
  defaultValue = '# New Note',
  className = '',
}: MilkdownEditorInnerProps) {
  const { loading } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, defaultValue);
        if (onChange) {
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChange(markdown);
          });
        }
      })
      .use(commonmark)
      .use(history)
      .use(listener);
  }, [onChange, defaultValue]);

  return (
    <div className={`milkdown-wrapper ${className}`}>
      {loading && (
        <div className="milkdown-loading p-4 text-gray-500">Loading editor...</div>
      )}
      <Milkdown />
    </div>
  );
}
