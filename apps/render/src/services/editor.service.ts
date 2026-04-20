import { resolve, Service } from '@rabjs/react';
import { vault } from '@/ipc/vault';
import { VaultService } from '@/services/vault.service';
import { UIService } from '@/services/ui.service';
import type { Position, Selection } from '../types/editor';
import matter from 'gray-matter';
import { debounce } from '@/utils/debounce';

export class EditorService extends Service {
  currentNote: { path: string; content: string; frontmatter: Record<string, unknown> } | null = null;
  content = '';
  cursor: Position = { line: 1, column: 1 };
  selection: Selection | null = null;
  isDirty = false;
  isSaving = false;
  lastSaved: Date | null = null;

  private debouncedSave = debounce(() => this.saveNote(), 300);

  private get vaultService(): VaultService | null {
    return this.resolve(VaultService);
  }

  private get uiService(): UIService | null {
    return this.resolve(UIService);
  }

  async initialize(): Promise<void> {
    // Restore the current note from saved state after vault is opened
    const vaultService = this.vaultService;
    if (vaultService?.path && vaultService.currentNotePath) {
      try {
        await this.openNote(vaultService.currentNotePath);
      } catch {
        // Ignore errors when restoring - user can manually open a note
      }
    }
  }

  async openNote(path: string): Promise<void> {
    console.log('[EditorService] openNote called:', {
      path,
      currentNote: this.currentNote,
      vaultPath: this.vaultService?.path,
    });
    this.debouncedSave.cancel();
    this.isSaving = false;
    if (this.isDirty && this.currentNote) {
      await this.saveNote();
    }

    const vaultPath = this.vaultService?.path;
    if (!vaultPath) {
      console.error('[EditorService] openNote failed: no vaultPath', {
        vaultPath: this.vaultService?.path,
      });
      throw new Error('Vault not open');
    }
    const note = await vault.readNote(vaultPath, path);
    this.currentNote = { path, content: note.content, frontmatter: note.frontmatter };
    this.content = note.content;
    this.isDirty = false;
    this.cursor = { line: 1, column: 1 };
    this.selection = null;
    console.log('[EditorService] openNote success:', { path, currentNote: this.currentNote });

    // Keep the explorer selection in sync with the opened note.
    if (this.vaultService) {
      this.vaultService.setActiveFile(path);
    }
  }

  updateContent(content: string): void {
    console.log('[EditorService] updateContent called:', {
      contentLength: content.length,
      preview: content.substring(0, 50),
    });
    if (this.content === content) {
      console.log('[EditorService] updateContent skipped: same content');
      return;
    }
    this.content = content;
    // Only mark dirty and save if we have an open note
    if (this.currentNote) {
      this.isDirty = true;
      // Debounced auto-save 300ms after content change
      this.debouncedSave();
    } else {
      console.log('[EditorService] updateContent: no note open, not saving');
    }
  }

  async saveNote(): Promise<void> {
    const note = this.currentNote;
    if (!note || !this.isDirty) {
      console.log('[EditorService] saveNote skipped:', {
        reason: !note ? 'no note' : 'not dirty',
        note,
        isDirty: this.isDirty,
      });
      return;
    }

    const vaultPath = this.vaultService?.path;
    if (!vaultPath) {
      console.error('[EditorService] saveNote failed: no vaultPath', {
        vaultServicePath: this.vaultService?.path,
      });
      return;
    }

    this.isSaving = true;

    try {
      console.log('[EditorService] saveNote:', {
        vaultPath,
        notePath: note.path,
        contentLength: this.content.length,
      });
      const frontmatter = this.currentNote?.frontmatter;
      let finalContent: string;
      if (frontmatter && Object.keys(frontmatter).length > 0) {
        try {
          finalContent = matter.stringify(this.content, frontmatter);
        } catch (stringifyError) {
          console.error('[EditorService] stringify failed:', stringifyError);
          this.isDirty = false;
          this.uiService?.showToast(
            `保存失败: ${stringifyError instanceof Error ? stringifyError.message : String(stringifyError)}\n请重试。`
          );
          return;
        }
      } else {
        finalContent = this.content;
      }
      await vault.writeNote(vaultPath, note.path, finalContent);
      this.currentNote = { ...note, content: finalContent };
      this.isDirty = false;
      this.lastSaved = new Date();
    } catch (error) {
      console.error('[EditorService] saveNote failed:', error);
      this.uiService?.showToast(
        `保存失败: ${error instanceof Error ? error.message : String(error)}\n请重试。`
      );
    } finally {
      this.isSaving = false;
    }
  }

  getFrontmatter(): Record<string, unknown> {
    return this.currentNote?.frontmatter ?? {};
  }

  updateFrontmatter(frontmatter: Record<string, unknown>): void {
    if (!this.currentNote) return;
    this.currentNote = { ...this.currentNote, frontmatter };
    this.isDirty = true;
    this.emit('frontmatterChanged', frontmatter);
    // Debounced auto-save 300ms after frontmatter change (blur/deploy)
    this.debouncedSave();
  }

  async createNote(path: string, content: string = ''): Promise<void> {
    const vaultPath = this.vaultService?.path ?? '';
    await vault.writeNote(vaultPath, path, content);
    this.currentNote = { path, content, frontmatter: {} };
    this.content = content;
    this.isDirty = false;

    if (this.vaultService) {
      this.vaultService.setActiveFile(path);
    }
  }
}

export const useEditorService = () => resolve(EditorService);
