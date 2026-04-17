import { resolve, Service } from '@rabjs/react';
import { vault } from '@/ipc/vault';
import { debounce } from '@/utils/debounce';
import type { Position, Selection } from '../types/editor';

const AUTO_SAVE_DELAY = 1000;

export class EditorService extends Service {
  currentNote: { path: string; content: string } | null = null;
  content = '';
  cursor: Position = { line: 1, column: 1 };
  selection: Selection | null = null;
  isDirty = false;
  isSaving = false;
  lastSaved: Date | null = null;

  private debouncedSave = debounce(async () => {
    await this.saveNote();
  }, AUTO_SAVE_DELAY);

  async openNote(path: string): Promise<void> {
    if (this.isDirty && this.currentNote) {
      await this.saveNote();
    }

    const note = await vault.readNote(path);
    this.currentNote = { path, content: note.content };
    this.content = note.content;
    this.isDirty = false;
    this.cursor = { line: 1, column: 1 };
    this.selection = null;
  }

  updateContent(content: string): void {
    if (this.content === content) {
      return;
    }
    this.content = content;
    this.isDirty = true;
    this.debouncedSave();
  }

  async saveNote(): Promise<void> {
    const note = this.currentNote;
    if (!note || !this.isDirty) {
      return;
    }

    this.isSaving = true;

    try {
      await vault.writeNote(note.path, this.content);
      this.currentNote = { ...note, content: this.content };
      this.isDirty = false;
      this.lastSaved = new Date();
    } finally {
      this.isSaving = false;
    }
  }

  async createNote(path: string, content: string = ''): Promise<void> {
    await vault.writeNote(path, content);
    this.currentNote = { path, content };
    this.content = content;
    this.isDirty = false;
  }
}

export const useEditorService = () => resolve(EditorService);
