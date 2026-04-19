import type { SearchResultGroup } from '@/services/search.service';
import { SearchResultItem } from './SearchResultItem';

interface SearchResultListProps {
  results: SearchResultGroup[];
  query: string;
  onResultClick?: (filePath: string, line?: number) => void;
}

export function SearchResultList({ results, query, onResultClick }: SearchResultListProps) {
  if (results.length === 0) {
    return (
      <div className="search-result-empty">
        No results found
      </div>
    );
  }

  return (
    <div className="search-result-list">
      {results.map((result) => (
        <SearchResultItem
          key={result.path}
          filePath={result.path}
          matches={result.matches}
          query={query}
          onResultClick={onResultClick}
        />
      ))}
    </div>
  );
}
