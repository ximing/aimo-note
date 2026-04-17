import { editorStore } from '../stores/editor.store';

export function useNote(path?: string) {
  return editorStore.use();
}
