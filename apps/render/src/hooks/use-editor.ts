import { editorService } from '../services/editor.service';

export function useEditor() {
  return editorService.use();
}
