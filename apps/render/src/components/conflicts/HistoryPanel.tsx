import { observer } from '@rabjs/react';
import { sync } from '@/ipc/sync';
import { useVaultService } from '@/services/vault.service';
import { useEffect, useState } from 'react';
import { Clock, X, RefreshCw, RotateCcw, FileText } from 'lucide-react';

interface HistoryEntry {
  revision: string;
  blobHash: string | null;
  commitSeq: number;
  createdAt: string;
  deviceId: string;
  isDeleted: boolean;
}

interface HistoryPanelProps {
  filePath: string;
  onClose: () => void;
  onRollback?: (revision: string) => void;
}

export const HistoryPanel = observer(({ filePath, onClose, onRollback }: HistoryPanelProps) => {
  const vaultService = useVaultService();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>('IDLE');

  const loadHistory = async () => {
    setLoading(true);
    const status = await sync.getStatus();
    if (status.success && status.vaultId && vaultService.vaultPath) {
      if (status.status) {
        setSyncStatus(status.status);
      }
      const result = await sync.listHistory(status.vaultId, filePath);
      if (result.success) {
        setHistory(result.items);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadHistory();
  }, [filePath, vaultService.vaultPath]);

  const handleRollback = async (revision: string) => {
    if (!vaultService.vaultPath) return;
    setRollingBack(revision);
    const result = await sync.rollback(vaultService.vaultPath, filePath, revision);
    if (result.success) {
      // Trigger auto-sync so the rollback propagates to other devices via normal sync commit flow
      // Per spec Phase 3: record trigger=rollback in runtime metadata
      await sync.trigger('rollback');
      onRollback?.(revision);
      onClose();
    }
    setRollingBack(null);
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
            <Clock className="text-blue-500" size={22} />
            <div>
              <h2 className="text-lg font-semibold">Revision History</h2>
              <p className="text-sm text-gray-500 truncate max-w-md">{filePath}</p>
            </div>
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
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No revision history found
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => (
                <div
                  key={entry.commitSeq}
                  className="border rounded-lg p-3 hover:bg-gray-50"
                >
                  <div className="flex items-start gap-3">
                    <FileText className="text-gray-400 mt-1" size={16} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {entry.revision}
                        {entry.isDeleted && (
                          <span className="ml-2 text-xs text-red-500">(deleted)</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(entry.createdAt)} · Device: {entry.deviceId || 'unknown'}
                      </p>
                    </div>
                    {!entry.isDeleted && (
                      <button
                        onClick={() => handleRollback(entry.revision)}
                        disabled={rollingBack === entry.revision}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                      >
                        <RotateCcw size={14} />
                        {rollingBack === entry.revision ? 'Restoring...' : 'Restore'}
                      </button>
                    )}
                    {(rollingBack === entry.revision || syncStatus === 'OFFLINE' || syncStatus === 'DISABLED') && (
                      <p className="text-xs text-gray-500 mt-1">
                        {rollingBack === entry.revision
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
            onClick={loadHistory}
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
