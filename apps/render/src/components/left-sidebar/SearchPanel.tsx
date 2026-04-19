import { observer, useService } from '@rabjs/react';
import { SearchService } from '@/services/search.service';
import { SearchInput } from './SearchInput';
import { SearchResultList } from './SearchResultList';

export const SearchPanel = observer(() => {
  const searchService = useService(SearchService);

  return (
    <div className="search-panel flex flex-col h-full">
      <SearchInput
        value={searchService.query}
        caseSensitive={searchService.caseSensitive}
        isRegex={searchService.isRegex}
        onChange={(value) => searchService.search(value)}
        onToggleCaseSensitive={() => searchService.toggleCaseSensitive()}
        onToggleRegex={() => searchService.toggleRegex()}
        onClear={() => searchService.clearResults()}
      />
      <div className="search-content flex-1 overflow-auto">
        {searchService.isSearching ? (
          <div className="search-status">Searching...</div>
        ) : searchService.error ? (
          <div className="search-status search-error">{searchService.error}</div>
        ) : searchService.results.length === 0 && searchService.query ? (
          <div className="search-status">No results found</div>
        ) : searchService.results.length > 0 ? (
          <SearchResultList
            results={searchService.results}
            query={searchService.query}
          />
        ) : (
          <div className="search-status search-hint">Enter keywords to search</div>
        )}
      </div>
    </div>
  );
});
