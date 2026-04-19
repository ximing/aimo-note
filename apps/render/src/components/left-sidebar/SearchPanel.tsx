import { observer, useService } from '@rabjs/react';
import { SearchService } from '@/services/search.service';
import { UIService } from '@/services/ui.service';
import { SearchInput } from './SearchInput';
import { SearchResultList } from './SearchResultList';

export const SearchPanel = observer(() => {
  const searchService = useService(SearchService);
  const uiService = useService(UIService);

  const handleResultClick = (filePath: string, line?: number) => {
    const title = filePath.split('/').pop() || filePath;
    const params = new URLSearchParams();
    if (line) params.set('line', String(line));
    if (searchService.query) params.set('highlight', searchService.query);
    const query = params.toString();
    const url = query ? `${filePath}?${query}` : filePath;
    uiService.openTab(url, title);
  };

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
            onResultClick={handleResultClick}
          />
        ) : (
          <div className="search-status search-hint">Enter keywords to search</div>
        )}
      </div>
    </div>
  );
});
