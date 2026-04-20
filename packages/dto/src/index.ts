// Core types for aimo-note
export interface Note {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface VaultStats {
  noteCount: number;
  lastModified: Date;
}

// Core types
export * from './search.js';
export * from './response.js';
export * from './template.js';
