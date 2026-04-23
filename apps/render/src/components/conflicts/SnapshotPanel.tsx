import { observer } from '@rabjs/react';
import { useSyncService } from '@/services/sync.service';
import { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, RotateCcw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type { SnapshotRecord, SnapshotRestoreResult as SnapshotRestoreResultDTO } from '@aimo-note/dto';

interface SnapshotPanelProps {
  onClose: () => void;
}

export const SnapshotPanel = observer(({ onClose }: SnapshotPanelProps) => {
  const syncService = useSyncService();
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [polling, setPolling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  // Polling cleanup ref
  const pollingRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollingRef.current = null;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Restore confirmation state
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [snapshotToRestore, setSnapshotToRestore] = useState<SnapshotRecord | null>(null);
  const [restoreResult, setRestoreResult] = useState<SnapshotRestoreResultDTO | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const loadSnapshots = async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    try {
      const result = await syncService.listSnapshots(pageNum, 20);
      if (pageNum === 1) {
        setSnapshots(result.items);
      } else {
        setSnapshots(prev => [...prev, ...result.items]);
      }
      setHasMore(result.hasMore);
      setTotal(result.total);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load snapshots');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshots();
  }, []);

  const handleCreateSnapshot = async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await syncService.createSnapshot();
      if (result.success) {
        // Refresh the list
        await loadSnapshots(1);
      } else {
        setError(result.error ?? 'Failed to create snapshot');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create snapshot');
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreClick = (snapshot: SnapshotRecord) => {
    // Pre-check: warn if there are pending changes
    if (syncService.pendingCount > 0) {
      setRestoreError(`Warning: You have ${syncService.pendingCount} unsaved change(s) that will NOT be included in this restore. The restore will revert your vault to the snapshot state and may overwrite your local changes.`);
    } else {
      setRestoreError(null);
    }
    setSnapshotToRestore(snapshot);
    setShowRestoreConfirm(true);
  };

  const handleConfirmRestore = async () => {
    if (!snapshotToRestore) return;

    setShowRestoreConfirm(false);
    setRestoring(snapshotToRestore.id);
    setRestoreResult(null);
    setRestoreError(null);
    setPolling(snapshotToRestore.id);

    // Create AbortController for polling cleanup
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Check for existing task first (409 Conflict case)
      const existingResult = await syncService.restoreSnapshot(snapshotToRestore.id);

      if (existingResult.existingTask) {
        // Restore already in progress, reuse existing task
        setRestoreResult(existingResult.existingTask);
      } else if (existingResult.success && existingResult.result) {
        setRestoreResult(existingResult.result);
      } else {
        setRestoreError(existingResult.error ?? 'Failed to restore snapshot');
        setRestoring(null);
        setPolling(null);
        return;
      }

      // Poll for status using the service (handles cleanup on unmount)
      const pollResult = await syncService.pollRestoreStatus(
        snapshotToRestore.id,
        undefined,
        abortController.signal
      );

      if (pollResult.success) {
        if (pollResult.status === 'succeeded') {
          setRestoreResult({
            snapshotId: snapshotToRestore.id,
            status: 'succeeded',
            restoredCommitSeq: 0,
            restoredFiles: 0,
            resultSummary: 'Restore completed',
            failureReason: null,
            finalCommitSeq: null,
          });
        } else if (pollResult.status === 'failed') {
          setRestoreError(pollResult.failureReason ?? 'Restore failed');
        }
      } else {
        setRestoreError(pollResult.error ?? 'Restore polling failed');
      }
    } catch (err) {
      // Check if it's a 409 Conflict (restore already in progress)
      if (err instanceof Error && err.message.includes('already in progress')) {
        // Try to get the existing task status
        const existingResult = await syncService.restoreSnapshot(snapshotToRestore.id);
        if (existingResult.existingTask) {
          setRestoreResult(existingResult.existingTask);
          // Poll using the service
          const pollResult = await syncService.pollRestoreStatus(
            snapshotToRestore.id,
            undefined,
            abortController.signal
          );
          if (pollResult.success) {
            if (pollResult.status === 'succeeded') {
              setRestoreResult({
                snapshotId: snapshotToRestore.id,
                status: 'succeeded',
                restoredCommitSeq: 0,
                restoredFiles: 0,
                resultSummary: 'Restore completed',
                failureReason: null,
                finalCommitSeq: null,
              });
            } else if (pollResult.status === 'failed') {
              setRestoreError(pollResult.failureReason ?? 'Restore failed');
            }
          } else {
            setRestoreError(pollResult.error ?? 'Restore polling failed');
          }
          setRestoring(null);
          setPolling(null);
          return;
        }
      }
      setRestoreError(err instanceof Error ? err.message : 'Failed to restore snapshot');
    } finally {
      setRestoring(null);
      setPolling(null);
      abortController.abort();
      abortControllerRef.current = null;
    }
  };

  const handleCancelRestore = () => {
    setShowRestoreConfirm(false);
    setSnapshotToRestore(null);
    setRestoring(null);
    setPolling(null);
    pollingRef.current = null;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatSize = (bytes: number | null) => {
    if (bytes === null) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'succeeded':
        return <CheckCircle className="text-green-500" size={16} />;
      case 'failed':
        return <AlertTriangle className="text-red-500" size={16} />;
      case 'pending':
      case 'running':
        return <Clock className="text-blue-500 animate-pulse" size={16} />;
      default:
        return <Clock className="text-gray-400" size={16} />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'succeeded': return 'Succeeded';
      case 'failed': return 'Failed';
      case 'pending': return 'Pending';
      case 'running': return 'Running';
      default: return status;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Camera className="text-purple-500" size={22} />
            <div>
              <h2 className="text-lg font-semibold">Vault Snapshots</h2>
              <p className="text-sm text-gray-500">{total} snapshot(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            {syncService.pendingCount > 0 && (
              <span className="text-sm text-amber-600 flex items-center gap-1">
                <AlertTriangle size={14} />
                {syncService.pendingCount} unsaved change(s)
              </span>
            )}
          </div>
          <button
            onClick={handleCreateSnapshot}
            disabled={creating || !syncService.isEnabled}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Camera size={14} />
            {creating ? 'Creating...' : 'Create Snapshot'}
          </button>
        </div>

        {/* Restore Result Banner */}
        {restoreResult && !polling && (
          <div className={`px-6 py-3 border-b ${restoreResult.status === 'succeeded' ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center gap-2">
              {restoreResult.status === 'succeeded' ? (
                <CheckCircle className="text-green-500" size={18} />
              ) : (
                <AlertTriangle className="text-red-500" size={18} />
              )}
              <span className={restoreResult.status === 'succeeded' ? 'text-green-700' : 'text-red-700'}>
                {restoreResult.status === 'succeeded'
                  ? `Restore succeeded: ${restoreResult.resultSummary ?? 'Vault restored'}`
                  : `Restore failed: ${restoreResult.failureReason ?? 'Unknown error'}`}
              </span>
              <button
                onClick={() => {
                  setRestoreResult(null);
                  setRestoreError(null);
                }}
                className="ml-auto text-gray-500 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Polling Status Banner */}
        {polling && (
          <div className="px-6 py-3 border-b bg-blue-50 flex items-center gap-2">
            <RefreshCw className="text-blue-500 animate-spin" size={18} />
            <span className="text-blue-700">Restoring snapshot... Please wait</span>
          </div>
        )}

        {/* Error Banner */}
        {restoreError && !restoreResult && (
          <div className="px-6 py-3 border-b bg-red-50 flex items-start gap-2">
            <AlertTriangle className="text-red-500 mt-0.5" size={18} />
            <div className="flex-1">
              <span className="text-red-700">{restoreError}</span>
            </div>
            <button
              onClick={() => setRestoreError(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && snapshots.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="animate-spin text-gray-400" size={24} />
            </div>
          ) : error && snapshots.length === 0 ? (
            <div className="text-center py-8 text-red-500">
              <AlertTriangle className="mx-auto mb-2" size={24} />
              <p>{error}</p>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Camera className="mx-auto mb-2 text-gray-300" size={32} />
              <p>No snapshots yet</p>
              <p className="text-sm mt-1">Create a snapshot to backup your vault state</p>
            </div>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="border rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-start gap-3">
                    {getStatusIcon(snapshot.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">
                          Snapshot {snapshot.baseSeq}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          snapshot.status === 'succeeded' ? 'bg-green-100 text-green-700' :
                          snapshot.status === 'failed' ? 'bg-red-100 text-red-700' :
                          snapshot.status === 'pending' || snapshot.status === 'running' ?
                            'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                        }`}>
                          {getStatusLabel(snapshot.status)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Created: {formatDate(snapshot.createdAt)}
                      </p>
                      {snapshot.finishedAt && (
                        <p className="text-xs text-gray-500">
                          Finished: {formatDate(snapshot.finishedAt)}
                        </p>
                      )}
                      {snapshot.sizeBytes !== null && (
                        <p className="text-xs text-gray-500">
                          Size: {formatSize(snapshot.sizeBytes)}
                        </p>
                      )}
                      {snapshot.status === 'failed' && snapshot.failureReason && (
                        <p className="text-xs text-red-600 mt-1">
                          Error: {snapshot.failureReason}
                        </p>
                      )}
                      {snapshot.status === 'succeeded' && snapshot.restoredCommitSeq !== null && (
                        <p className="text-xs text-green-600 mt-1">
                          Restored to commit seq {snapshot.restoredCommitSeq}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRestoreClick(snapshot)}
                        disabled={
                          restoring === snapshot.id ||
                          polling === snapshot.id ||
                          !syncService.isEnabled ||
                          (snapshot.status !== 'succeeded' && snapshot.status !== 'failed')
                        }
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RotateCcw size={14} />
                        {restoring === snapshot.id ? 'Starting...' : 'Restore'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Load More */}
              {hasMore && (
                <div className="text-center py-4">
                  <button
                    onClick={() => loadSnapshots(page + 1)}
                    disabled={loading}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                  >
                    {loading ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex justify-between">
          <button
            onClick={() => loadSnapshots(1)}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded flex items-center gap-2"
          >
            <RefreshCw size={14} />
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

      {/* Restore Confirmation Dialog */}
      {showRestoreConfirm && snapshotToRestore && (
        <ConfirmDialog
          title="Restore Snapshot"
          message={
            restoreError
              ? `${restoreError}\n\nDo you still want to proceed with the restore?`
              : `Are you sure you want to restore snapshot ${snapshotToRestore.baseSeq}?\n\nThis will revert your vault to the state at commit seq ${snapshotToRestore.baseSeq}.`
          }
          confirmText="Restore"
          cancelText="Cancel"
          danger
          onConfirm={handleConfirmRestore}
          onCancel={handleCancelRestore}
        />
      )}
    </div>
  );
});
