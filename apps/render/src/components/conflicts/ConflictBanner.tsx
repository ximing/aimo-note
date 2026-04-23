import { observer } from '@rabjs/react';
import { useVaultService } from '@/services/vault.service';
import { sync } from '@/ipc/sync';
import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConflictInfo {
  id: string;
  filePath: string;
  expectedBaseRevision: string;
  actualHeadRevision: string;
  remoteBlobHash: string;
  winningCommitSeq: number;
  losingDeviceId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface ConflictBannerProps {
  onClick?: () => void;
}

export const ConflictBanner = observer(({ onClick }: ConflictBannerProps) => {
  const vaultService = useVaultService();
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!vaultService.vaultPath) return;

    const loadConflicts = async () => {
      // vaultPath is local file path, not vaultId - sync.getConflicts needs vaultId from sync settings
      const status = await sync.getStatus();
      if (status.success && status.vaultId) {
        const result = await sync.getConflicts(status.vaultId);
        if (result.success && result.conflicts.length > 0) {
          setConflicts(result.conflicts);
          setDismissed(false);
        } else {
          setConflicts([]);
          setDismissed(true);
        }
      } else {
        setConflicts([]);
        setDismissed(true);
      }
    };

    loadConflicts();
    // Refresh periodically
    const interval = setInterval(loadConflicts, 30000);
    return () => clearInterval(interval);
  }, [vaultService.vaultPath]);

  if (conflicts.length === 0 || dismissed) {
    return null;
  }

  return (
    <div
      className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-amber-100"
      onClick={onClick}
    >
      <AlertTriangle className="text-amber-600" size={18} />
      <span className="text-sm text-amber-800 flex-1">
        {conflicts.length} unresolved conflict{conflicts.length > 1 ? 's' : ''}. Click to view.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="text-xs text-amber-600 hover:text-amber-800 px-2 py-1"
      >
        Dismiss
      </button>
    </div>
  );
});
