import { useEffect } from 'react';

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[--bg-primary] border border-[--border] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] w-full max-w-md p-6"
      >
        <h3 className="text-lg font-semibold mb-2 text-[--text-primary]">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[--bg-tertiary] text-[--text-primary] hover:bg-[--border] transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-colors ${danger ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[--accent] text-white hover:bg-[--accent-hover]'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
