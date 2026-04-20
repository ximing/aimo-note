import { useState } from 'react';
import type { SearchMatch } from '@aimo-note/dto';

interface SearchResultItemProps {
  filePath: string;
  matches: SearchMatch[];
  onResultClick: (filePath: string, line?: number) => void;
}

function highlightMatch(text: string, charStart: number, charEnd: number, matchedText: string) {
  const safeStart = Math.max(0, Math.min(charStart, text.length));
  const normalizedMatchedText = matchedText || text.slice(safeStart, charEnd);
  const safeEnd = Math.max(safeStart, Math.min(text.length, safeStart + normalizedMatchedText.length));
  const contextLength = 24;
  const snippetStart = Math.max(0, safeStart - contextLength);
  const snippetEnd = Math.min(text.length, safeEnd + contextLength);
  const prefix = snippetStart > 0 ? `...${text.slice(snippetStart, safeStart)}` : text.slice(0, safeStart);
  const highlightText = text.slice(safeStart, safeEnd);
  const suffix = snippetEnd < text.length ? `${text.slice(safeEnd, snippetEnd)}...` : text.slice(safeEnd);

  return (
    <>
      {prefix}
      <mark className="search-highlight">{highlightText}</mark>
      {suffix}
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
        {visibleMatches.map((match, index) => {
          const displayText = match.text.replace(/\r?\n$/, '');

          return (
            <div
              key={`${match.path}-${match.line}-${index}`}
              className="search-result-line"
              onClick={() => onResultClick(filePath, match.line)}
            >
              <span className="search-result-line-number">{match.line}</span>
              <span className="search-result-line-text">
                {highlightMatch(displayText, match.charStart, match.charEnd, match.matchedText)}
              </span>
            </div>
          );
        })}
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
