import { Service, resolve } from '@rabjs/react';

export interface SearchResult {
  path: string;
  score: number;
  matches: unknown[];
}

export class SearchService extends Service {
  query = '';
  results: SearchResult[] = [];
  isSearching = false;

  async search(query: string): Promise<void> {
    // TODO: implement
    console.log('search', query);
  }
}

export function useSearchService(): SearchService {
  return resolve(SearchService);
}
