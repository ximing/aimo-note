import { useState, useEffect, useRef } from 'react';

export interface PromptDialogProps {
  title: string;
  defaultValue?: string;
  placeholder?: string;
  cancelText?: string;
  confirmText?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({
  title,
  defaultValue = '',
  placeholder = '',
  cancelText,
  confirmText,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[--bg-primary] border border-[--border] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] w-full max-w-md p-6"
      >
        <h3 className="text-lg font-semibold mb-2 text-[--text-primary]">{title}</h3>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-4 py-3 border-2 border-[--border] rounded-lg bg-[--bg-primary] text-[--text-primary] focus:outline-none focus:border-[--accent] transition-colors"
          autoFocus
        />
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[--bg-tertiary] text-[--text-primary] hover:bg-[--border] transition-colors"
          >
            {cancelText || '取消'}
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[--accent] text-white hover:bg-[--accent-hover] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {confirmText || 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
}
