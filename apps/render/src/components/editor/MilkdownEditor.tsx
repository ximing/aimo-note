import { MilkdownProvider } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { MilkdownEditorInner } from './MilkdownEditorInner';

export interface MilkdownEditorProps {
  onChange?: (markdown: string) => void;
  defaultValue?: string;
  className?: string;
}

export function MilkdownEditor({
  onChange,
  defaultValue = '# New Note',
  className = '',
}: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner
        onChange={onChange}
        defaultValue={defaultValue}
        className={className}
      />
    </MilkdownProvider>
  );
}
