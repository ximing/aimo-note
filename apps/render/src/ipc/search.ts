// Re-export types from dto package
export type { SearchMatch, SearchResult, SearchOptions, SearchResponse } from '@aimo-note/dto';

import type { SearchOptions, SearchResponse } from '@aimo-note/dto';

export interface Search {
  search(options: SearchOptions): Promise<SearchResponse>;
}

export const search: Search = {
  async search(options: SearchOptions) {
    return window.electronAPI.search.search(options);
  },
};
