export interface Position {
  line: number;
  column: number;
}

export interface Selection {
  start: Position;
  end: Position;
}

export interface EditorMode {
  type: 'edit' | 'preview' | 'split';
}
