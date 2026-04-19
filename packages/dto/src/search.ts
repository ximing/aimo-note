/**
 * Search-related types shared between main and renderer processes
 */

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchResult {
  path: string;
  line: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchOptions {
  query: string;
  rootPath: string;
  caseSensitive: boolean;
  isRegex: boolean;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  error?: string;
}
