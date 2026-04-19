import { Search, CaseSensitive, Regex, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  caseSensitive: boolean;
  isRegex: boolean;
  onChange: (value: string) => void;
  onToggleCaseSensitive: () => void;
  onToggleRegex: () => void;
  onClear: () => void;
}

export function SearchInput({
  value,
  caseSensitive,
  isRegex,
  onChange,
  onToggleCaseSensitive,
  onToggleRegex,
  onClear,
}: SearchInputProps) {
  return (
    <div className="search-input-container">
      <div className="search-input-row">
        <Search size={14} className="search-input-icon" />
        <input
          type="text"
          className="search-input"
          placeholder="Search notes..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
        {value && (
          <button
            type="button"
            className="search-input-clear"
            onClick={onClear}
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="search-options-row">
        <button
          type="button"
          className={`search-option-button ${caseSensitive ? 'active' : ''}`}
          onClick={onToggleCaseSensitive}
          title="Case sensitive"
        >
          <CaseSensitive size={14} />
          <span>Aa</span>
        </button>
        <button
          type="button"
          className={`search-option-button ${isRegex ? 'active' : ''}`}
          onClick={onToggleRegex}
          title="Use regular expression"
        >
          <Regex size={14} />
          <span>.*</span>
        </button>
      </div>
    </div>
  );
}
