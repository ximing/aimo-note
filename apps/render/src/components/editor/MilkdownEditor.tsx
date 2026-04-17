import { MilkdownProvider } from '@milkdown/react';
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
