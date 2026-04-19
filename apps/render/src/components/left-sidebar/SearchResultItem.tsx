import { useState } from 'react';
import type { SearchMatch } from '@aimo-note/dto';

interface SearchResultItemProps {
  filePath: string;
  matches: SearchMatch[];
  onResultClick: (filePath: string, line?: number) => void;
}

function highlightMatch(text: string, byteStart: number, byteEnd: number) {
  // Convert byte offset to character index (UTF-16 code unit)
  // ASCII: byte index == char index
  // Multi-byte chars (Chinese 3 bytes, emoji 4 bytes): byte index > char index
  const charStart = [...text.slice(0, byteStart)].length;
  const charEnd = [...text.slice(0, byteEnd)].length;

  return (
    <>
      {text.slice(0, charStart)}
      <mark className="search-highlight">{text.slice(charStart, charEnd)}</mark>
      {text.slice(charEnd)}
    </>
  );
}

export function SearchResultItem({ filePath, matches, onResultClick }: SearchResultItemProps) {
  const [expanded, setExpanded] = useState(false);

  const fileName = filePath.split('/').pop() || filePath;
  const folderPath = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';

  const visibleMatches = expanded ? matches : matches.slice(0, 3);
  const hiddenCount = Math.max(0, matches.length - 3);

  return (
    <div className="search-result-item">
      <div className="search-result-header">
        <span className="search-result-file">{fileName}</span>
        <span className="search-result-count">{matches.length} matches</span>
      </div>
      {folderPath && <div className="search-result-folder">{folderPath}</div>}
      <div className="search-result-matches">
        {visibleMatches.map((match, index) => (
          <div
            key={`${match.path}-${match.line}-${index}`}
            className="search-result-line"
            onClick={() => onResultClick(filePath, match.line)}
          >
            <span className="search-result-line-number">{match.line}</span>
            <span className="search-result-line-text">
              {highlightMatch(match.text, match.byteStart, match.byteEnd)}
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
