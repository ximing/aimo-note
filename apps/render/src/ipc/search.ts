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
  async search(query: string, limit = 50) {
    // TODO: IPC call - window.electronAPI.search.query(query, limit)
    return [];
  },
  async searchInContent(query: string) {
    // TODO: IPC call - window.electronAPI.search.queryContent(query)
    return [];
  },
};
