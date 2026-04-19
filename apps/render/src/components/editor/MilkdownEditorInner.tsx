import { useEditor } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { Milkdown } from '@milkdown/react';
import { useRef, useEffect } from 'react';

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
  const defaultValueRef = useRef(defaultValue);
  const onChangeRef = useRef(onChange);

  // Keep refs updated without triggering re-render
  useEffect(() => {
    defaultValueRef.current = defaultValue;
    onChangeRef.current = onChange;
  });

  const { loading } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, defaultValueRef.current);
        if (onChangeRef.current) {
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChangeRef.current?.(markdown);
          });
        }
      })
      .use(commonmark)
      .use(history)
      .use(listener);
  }, []); // Empty deps - editor created once, content managed via onChange

  return (
    <div className={`milkdown-wrapper h-full flex flex-col ${className}`}>
      {loading && (
        <div className="milkdown-loading p-4 text-gray-500">Loading editor...</div>
      )}
      <div className="milkdown h-full flex flex-col">
        <Milkdown />
      </div>
    </div>
  );
}
