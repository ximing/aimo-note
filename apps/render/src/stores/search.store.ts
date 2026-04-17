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

class SearchStore extends Service<SearchState> {
  protected state: SearchState = {
    query: '',
    results: [],
    isSearching: false,
  };

  async search(query: string): Promise<void> {
    // TODO: implement
  }
}

export const searchStore = new SearchStore();
export function useSearchStore() {
  return searchStore.use();
}
