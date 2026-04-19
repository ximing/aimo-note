import { useState } from 'react';
import type { SearchMatch } from '@aimo-note/dto';

interface SearchResultItemProps {
  filePath: string;
  matches: SearchMatch[];
  onResultClick: (filePath: string, line?: number) => void;
}

function utf8ByteOffsetToStringIndex(text: string, byteOffset: number): number {
  if (byteOffset <= 0) {
    return 0;
  }

  const encoder = new TextEncoder();
  let currentByteOffset = 0;
  let stringIndex = 0;

  for (const char of text) {
    const nextByteOffset = currentByteOffset + encoder.encode(char).length;
    if (nextByteOffset > byteOffset) {
      break;
    }

    currentByteOffset = nextByteOffset;
    stringIndex += char.length;
  }

  return stringIndex;
}

function highlightMatch(text: string, byteStart: number, byteEnd: number) {
  const stringStart = utf8ByteOffsetToStringIndex(text, byteStart);
  const stringEnd = utf8ByteOffsetToStringIndex(text, byteEnd);

  return (
    <>
      {text.slice(0, stringStart)}
      <mark className="search-highlight">{text.slice(stringStart, stringEnd)}</mark>
      {text.slice(stringEnd)}
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
                {highlightMatch(displayText, match.byteStart, match.byteEnd)}
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
