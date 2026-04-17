import { Service } from '@rabjs/react';
import type { Position, Selection } from '../types/editor';

export interface EditorState {
  currentNote: { path: string; content: string } | null;
  content: string;
  cursor: Position;
  selection: Selection | null;
  isDirty: boolean;
}

class EditorService extends Service<EditorState> {
  protected state: EditorState = {
    currentNote: null,
    content: '',
    cursor: { line: 1, column: 1 },
    selection: null,
    isDirty: false,
  };

  async openNote(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _path: string): Promise<void> {
    // TODO: implement
  }

  async saveNote(): Promise<void> {
    // TODO: implement
  }
}

export const editorService = new EditorService();
export function useEditorService() {
  return editorService.use();
}
