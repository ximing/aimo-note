export interface SearchResult {
  path: string;
  score: number;
  matches: unknown[];
}

export interface Search {
  search(query: string, limit?: number): Promise<SearchResult[]>;
  searchInContent(query: string): Promise<SearchResult[]>;
}

export const search: Search = {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  async search(_query: string, _limit = 50) {
    // TODO: IPC call - window.electronAPI.search.query(query, limit)
    return [];
  },
  async searchInContent(_query: string) {
    // TODO: IPC call - window.electronAPI.search.queryContent(query)
    return [];
  },
  /* eslint-enable @typescript-eslint/no-unused-vars */
};
