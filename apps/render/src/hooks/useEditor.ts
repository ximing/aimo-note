import { editorStore } from '../stores/editor.store';

export function useEditor() {
  return editorStore.use();
}
