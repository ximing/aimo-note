export interface Note {
  path: string;
  content: string;
  metadata: NoteMetadata;
}

export interface NoteMetadata {
  path: string;
  title: string;
  created: Date;
  modified: Date;
  tags: string[];
  links: string[];
  backlinks: string[];
}
