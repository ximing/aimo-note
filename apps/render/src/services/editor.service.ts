import { Service } from '@rabjs/react';
import { vault } from '@/ipc/vault';
import { debounce } from '@/utils/debounce';
import type { Position, Selection } from '../types/editor';

export interface EditorState {
  currentNote: { path: string; content: string } | null;
  content: string;
  cursor: Position;
  selection: Selection | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
}

const AUTO_SAVE_DELAY = 1000;

class EditorService extends Service<EditorState> {
  protected state: EditorState = {
    currentNote: null,
    content: '',
    cursor: { line: 1, column: 1 },
    selection: null,
    isDirty: false,
    isSaving: false,
    lastSaved: null,
  };

  private debouncedSave = debounce(async () => {
    await this.saveNote();
  }, AUTO_SAVE_DELAY);

  async openNote(path: string): Promise<void> {
    if (this.state.isDirty && this.state.currentNote) {
      await this.saveNote();
    }

    const note = await vault.readNote(path);
    this.state.currentNote = { path, content: note.content };
    this.state.content = note.content;
    this.state.isDirty = false;
    this.state.cursor = { line: 1, column: 1 };
    this.state.selection = null;
    this.notify();
  }

  updateContent(content: string): void {
    if (this.state.content === content) {
      return;
    }
    this.state.content = content;
    this.state.isDirty = true;
    this.notify();
    this.debouncedSave();
  }

  async saveNote(): Promise<void> {
    const note = this.state.currentNote;
    if (!note || !this.state.isDirty) {
      return;
    }

    this.state.isSaving = true;
    this.notify();

    try {
      await vault.writeNote(note.path, this.state.content);
      this.state.currentNote = { ...note, content: this.state.content };
      this.state.isDirty = false;
      this.state.lastSaved = new Date();
    } finally {
      this.state.isSaving = false;
      this.notify();
    }
  }

  async createNote(path: string, content: string = ''): Promise<void> {
    await vault.writeNote(path, content);
    this.state.currentNote = { path, content };
    this.state.content = content;
    this.state.isDirty = false;
    this.notify();
  }
}

export const editorService = new EditorService();
export function useEditorService() {
  return editorService.use();
}
