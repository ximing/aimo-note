import { useState } from 'react';
import { useSearch } from '../../hooks/use-search';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const { results, isSearching } = useSearch();

  return (
    <div className="search-page p-4">
      <h1 className="text-2xl font-bold mb-4">Search</h1>
      <input
        type="text"
        className="search-input w-full p-2 border rounded mb-4"
        placeholder="Search notes..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {isSearching ? (
        <p className="text-gray-500">Searching...</p>
      ) : results.length > 0 ? (
        <ul className="search-results">
          {results.map((result) => (
            <li key={result.path} className="p-2 border-b hover:bg-gray-50">
              <span className="font-medium">{result.path}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-400">No results found.</p>
      )}
    </div>
  );
}
