import { MilkdownProvider } from '@milkdown/react';
import { MilkdownEditorInner } from './MilkdownEditorInner';

export interface MilkdownEditorProps {
  onChange?: (markdown: string) => void;
  defaultValue?: string;
  className?: string;
  highlightQuery?: string;
  editorRef?: React.MutableRefObject<{ dom: HTMLElement | null }>;
}

export function MilkdownEditor({
  onChange,
  defaultValue = '# New Note',
  className = '',
  highlightQuery,
  editorRef,
}: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner
        onChange={onChange}
        defaultValue={defaultValue}
        className={className}
        highlightQuery={highlightQuery}
        editorRef={editorRef}
      />
    </MilkdownProvider>
  );
}
