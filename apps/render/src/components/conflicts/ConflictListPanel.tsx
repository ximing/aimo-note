import { observer } from '@rabjs/react';
import { sync } from '@/ipc/sync';
import { useEffect, useState } from 'react';
import { AlertTriangle, X, FileText, RefreshCw } from 'lucide-react';

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
  conflictCopyPath: string | null;
}

interface ConflictListPanelProps {
  onClose: () => void;
}

export const ConflictListPanel = observer(({ onClose }: ConflictListPanelProps) => {
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>('IDLE');

  const loadConflicts = async () => {
    setLoading(true);
    const status = await sync.getStatus();
    if (status.success && status.vaultId) {
      if (status.status) {
        setSyncStatus(status.status);
      }
      const result = await sync.getConflicts(status.vaultId);
      if (result.success) {
        setConflicts(result.conflicts);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadConflicts();
  }, []);

  const handleResolve = async (conflictId: string) => {
    setResolving(conflictId);
    const result = await sync.resolveConflict(conflictId, '');
    if (result.success) {
      await loadConflicts();
      // Trigger auto-sync so the resolve propagates via normal sync flow
      await sync.trigger();
    }
    setResolving(null);
  };

  const handleOpenConflictCopy = async (conflictId: string, conflictCopyPath: string) => {
    await sync.openConflictCopy(conflictId, conflictCopyPath);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-500" size={22} />
            <h2 className="text-lg font-semibold">Unresolved Conflicts</h2>
            <span className="text-sm text-gray-500">({conflicts.length})</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="animate-spin text-gray-400" size={24} />
            </div>
          ) : conflicts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No unresolved conflicts
            </div>
          ) : (
            <div className="space-y-3">
              {conflicts.map((conflict) => (
                <div
                  key={conflict.id}
                  className="border rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="text-gray-400 mt-1" size={18} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {conflict.filePath}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Detected: {formatDate(conflict.createdAt)}
                      </p>
                      {conflict.losingDeviceId && (
                        <p className="text-xs text-gray-500">
                          Losing device: {conflict.losingDeviceId}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenConflictCopy(conflict.id, conflict.conflictCopyPath ?? conflict.filePath)}
                        className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        Open Copy
                      </button>
                      <button
                        onClick={() => handleResolve(conflict.id)}
                        disabled={resolving === conflict.id}
                        className="px-3 py-1.5 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded"
                      >
                        {resolving === conflict.id ? 'Resolving...' : 'Mark Resolved'}
                      </button>
                    </div>
                    {(resolving === conflict.id || syncStatus === 'OFFLINE' || syncStatus === 'DISABLED') && (
                      <p className="text-xs text-gray-500 mt-1">
                        {resolving === conflict.id
                          ? '等待同步...'
                          : '离线操作，联网后自动继续'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex justify-between">
          <button
            onClick={loadConflicts}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            Refresh
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});
