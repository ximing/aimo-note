export interface SearchResult {
  path: string;
  score: number;
  matches: SearchMatch[];
}

export interface SearchMatch {
  field: string;
  indices: [number, number][];
  value: string;
}

export interface SearchIndex {
  add(path: string, content: string): void;
  remove(path: string): void;
  search(query: string, limit?: number): SearchResult[];
}
