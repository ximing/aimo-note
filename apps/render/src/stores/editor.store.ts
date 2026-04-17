import { Service } from '@rabjs/react';
import type { Position, Selection } from '../types/editor';

export interface EditorState {
  currentNote: { path: string; content: string } | null;
  content: string;
  cursor: Position;
  selection: Selection | null;
  isDirty: boolean;
}

class EditorStore extends Service<EditorState> {
  protected state: EditorState = {
    currentNote: null,
    content: '',
    cursor: { line: 1, column: 1 },
    selection: null,
    isDirty: false,
  };

  async openNote(path: string): Promise<void> {
    // TODO: implement
  }

  async saveNote(): Promise<void> {
    // TODO: implement
  }
}

export const editorStore = new EditorStore();
export function useEditorStore() {
  return editorStore.use();
}
