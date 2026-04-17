import { Service } from '@rabjs/react';

export interface SearchResult {
  path: string;
  score: number;
  matches: unknown[];
}

export interface SearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
}

class SearchService extends Service<SearchState> {
  protected state: SearchState = {
    query: '',
    results: [],
    isSearching: false,
  };

  async search(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _query: string): Promise<void> {
    // TODO: implement
  }
}

export const searchService = new SearchService();
export function useSearchService() {
  return searchService.use();
}
