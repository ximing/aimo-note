import { useState } from 'react';
import type { SearchMatch } from '@aimo-note/dto';

interface SearchResultItemProps {
  filePath: string;
  matches: SearchMatch[];
  query: string;
  defaultExpanded?: number;
}

function highlightMatch(text: string, start: number, end: number) {
  return (
    <>
      {text.slice(0, start)}
      <mark className="search-highlight">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

export function SearchResultItem({ filePath, matches, query, defaultExpanded = 3 }: SearchResultItemProps) {
  const [expanded, setExpanded] = useState(false);

  const fileName = filePath.split('/').pop() || filePath;
  const folderPath = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';

  const visibleMatches = expanded ? matches : matches.slice(0, defaultExpanded);
  const hiddenCount = Math.max(0, matches.length - defaultExpanded);

  return (
    <div className="search-result-item">
      <div className="search-result-header">
        <span className="search-result-file">{fileName}</span>
        <span className="search-result-count">{matches.length} matches</span>
      </div>
      {folderPath && <div className="search-result-folder">{folderPath}</div>}
      <div className="search-result-matches">
        {visibleMatches.map((match, index) => (
          <div key={`${match.path}-${match.line}-${index}`} className="search-result-line">
            <span className="search-result-line-number">{match.line}</span>
            <span className="search-result-line-text">
              {highlightMatch(match.text, match.matchStart, match.matchEnd)}
            </span>
          </div>
        ))}
        {!expanded && hiddenCount > 0 && (
          <button
            type="button"
            className="search-result-show-more"
            onClick={() => setExpanded(true)}
          >
            Show {hiddenCount} more
          </button>
        )}
      </div>
    </div>
  );
}
