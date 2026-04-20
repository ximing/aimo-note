export interface Vault {
  open(path: string): Promise<void>;
  close(): Promise<void>;
  readNote(path: string): Promise<Note>;
  writeNote(path: string, content: string): Promise<void>;
  deleteNote(path: string): Promise<void>;
  listNotes(): Promise<string[]>;
  watch(callback: (event: VaultEvent) => void): () => void;
}

export interface Note {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface VaultEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
}

export * from './template.js';
