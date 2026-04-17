import { editorService } from '../services/editor.service';

export function useNote(path?: string) {
  return editorService.use();
}
