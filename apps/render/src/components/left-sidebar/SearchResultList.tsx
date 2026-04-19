import type { SearchResultGroup } from '@/services/search.service';
import { SearchResultItem } from './SearchResultItem';

interface SearchResultListProps {
  results: SearchResultGroup[];
  query?: string;
  onResultClick: (filePath: string, line?: number) => void;
}

export function SearchResultList({ results, onResultClick }: SearchResultListProps) {
  return (
    <div className="search-result-list">
      {results.map((result, index) => {
        const normalizedPath = typeof result.path === 'string' ? result.path : String(result.path);

        return (
          <SearchResultItem
            key={`${normalizedPath}-${index}`}
            filePath={normalizedPath}
            matches={result.matches}
            onResultClick={onResultClick}
          />
        );
      })}
    </div>
  );
}
