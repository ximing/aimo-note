import { Service, resolve } from '@rabjs/react';
import { search as searchIPC } from '@/ipc/search';
import { VaultService } from './vault.service';
import type { SearchMatch } from '@aimo-note/dto';

export interface SearchResultGroup {
  path: string;
  matches: SearchMatch[];
}

export class SearchService extends Service {
  query = '';
  results: SearchResultGroup[] = [];
  isSearching = false;
  caseSensitive = false;
  isRegex = false;
  error: string | null = null;

  private get vaultService(): VaultService {
    return resolve(VaultService);
  }

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  get defaultRootPath(): string {
    return this.vaultService.vaultPath || '';
  }

  search(query: string): void {
    this.query = query;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (!query.trim()) {
      this.results = [];
      this.isSearching = false;
      this.error = null;
      return;
    }

    this.isSearching = true;
    this.debounceTimer = setTimeout(() => {
      this.executeSearch();
    }, 300);
  }

  private async executeSearch(): Promise<void> {
    const rootPath = this.defaultRootPath;
    if (!rootPath) {
      this.results = [];
      this.isSearching = false;
      return;
    }

    try {
      const response = await searchIPC.search({
        query: this.query,
        rootPath,
        caseSensitive: this.caseSensitive,
        isRegex: this.isRegex,
      });

      if (response.success) {
        // Group results by file path
        const grouped = new Map<string, SearchMatch[]>();
        for (const result of response.results) {
          const existing = grouped.get(result.path) || [];
          existing.push({
            path: result.path,
            line: result.line,
            text: result.text,
            matchedText: result.matchedText,
            charStart: result.charStart,
            charEnd: result.charEnd,
            byteStart: result.byteStart,
            byteEnd: result.byteEnd,
          });
          grouped.set(result.path, existing);
        }

        this.results = Array.from(grouped.entries()).map(([path, matches]) => ({
          path,
          matches,
        }));
        this.error = null;
      } else {
        this.results = [];
        this.error = response.error || 'Search failed';
      }
    } catch (err) {
      this.results = [];
      this.error = String(err);
    } finally {
      this.isSearching = false;
    }
  }

  toggleCaseSensitive(): void {
    this.caseSensitive = !this.caseSensitive;
    if (this.query.trim()) {
      this.search(this.query);
    }
  }

  toggleRegex(): void {
    this.isRegex = !this.isRegex;
    if (this.query.trim()) {
      this.search(this.query);
    }
  }

  clearResults(): void {
    this.query = '';
    this.results = [];
    this.isSearching = false;
    this.error = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

export function useSearchService(): SearchService {
  return resolve(SearchService);
}
