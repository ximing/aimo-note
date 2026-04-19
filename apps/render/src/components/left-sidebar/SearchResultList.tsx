import type { SearchResultGroup } from '@/services/search.service';
import { SearchResultItem } from './SearchResultItem';

interface SearchResultListProps {
  results: SearchResultGroup[];
  onResultClick: (filePath: string, line?: number) => void;
}

export function SearchResultList({ results, onResultClick }: SearchResultListProps) {
  return (
    <div className="search-result-list">
      {results.map((result) => (
        <SearchResultItem
          key={result.path}
          filePath={result.path}
          matches={result.matches}
          onResultClick={onResultClick}
        />
      ))}
    </div>
  );
}
