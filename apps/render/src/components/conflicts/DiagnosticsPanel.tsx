import { observer } from '@rabjs/react';
import { useSyncService } from '@/services/sync.service';
import { useEffect, useState } from 'react';
import { X, RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle } from 'lucide-react';

interface DiagnosticsData {
  lastTriggerSource: string | null;
  offlineReason: string | null;
  nextRetryAt: string | null;
  lastFailedRequestId: string | null;
  lastFailedRequestDeviceId: string | null;
  lastSuccessfulSyncAt: string | null;
  consecutiveFailures: number;
}

interface DiagnosticsPanelProps {
  onClose: () => void;
}

export const DiagnosticsPanel = observer(({ onClose }: DiagnosticsPanelProps) => {
  const syncService = useSyncService();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await syncService.getDiagnostics();
      setDiagnostics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diagnostics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatDuration = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h ago`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  const getTriggerLabel = (trigger: string | null) => {
    const labels: Record<string, string> = {
      startup: 'App Startup',
      login: 'User Login',
      network_recovery: 'Network Recovery',
      pending_change: 'Pending Changes',
      periodic_poll: 'Periodic Poll',
      manual: 'Manual Sync',
      rollback: 'Rollback',
      offline_recovery_retry: 'Offline Recovery',
    };
    return trigger ? (labels[trigger] || trigger) : 'Unknown';
  };

  const getStatusIcon = () => {
    if (!syncService.isEnabled) {
      return <WifiOff className="text-gray-400" size={20} />;
    }
    if (syncService.status === 'OFFLINE') {
      return <WifiOff className="text-red-500" size={20} />;
    }
    if (syncService.status === 'SYNCING') {
      return <RefreshCw className="text-blue-500 animate-spin" size={20} />;
    }
    if (syncService.status === 'ERROR') {
      return <AlertCircle className="text-red-500" size={20} />;
    }
    return <Wifi className="text-green-500" size={20} />;
  };

  const getStatusLabel = () => {
    switch (syncService.status) {
      case 'DISABLED': return 'Disabled';
      case 'IDLE': return 'Idle';
      case 'PENDING': return 'Pending';
      case 'SYNCING': return 'Syncing';
      case 'OFFLINE': return 'Offline';
      case 'ERROR': return 'Error';
      default: return syncService.status;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <h2 className="text-lg font-semibold">Sync Diagnostics</h2>
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
          ) : error ? (
            <div className="text-center py-8 text-red-500">
              <AlertCircle className="mx-auto mb-2" size={24} />
              <p>{error}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sync Status */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`font-medium ${
                  syncService.status === 'OFFLINE' ? 'text-red-600' :
                  syncService.status === 'ERROR' ? 'text-red-600' :
                  syncService.status === 'SYNCING' ? 'text-blue-600' :
                  'text-green-600'
                }`}>
                  {getStatusLabel()}
                </span>
              </div>

              {/* Last Sync */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Last Successful Sync</span>
                <span className="text-sm">
                  {diagnostics?.lastSuccessfulSyncAt
                    ? formatDuration(diagnostics.lastSuccessfulSyncAt)
                    : 'Never'}
                </span>
              </div>

              {/* Last Trigger Source */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Last Trigger</span>
                <span className="text-sm font-medium">
                  {diagnostics?.lastTriggerSource
                    ? getTriggerLabel(diagnostics.lastTriggerSource)
                    : 'None'}
                </span>
              </div>

              {/* Offline Reason */}
              {syncService.status === 'OFFLINE' && (
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <span className="text-sm text-red-600">Offline Reason</span>
                  <span className="text-sm text-red-700">
                    {diagnostics?.offlineReason || 'Connection lost'}
                  </span>
                </div>
              )}

              {/* Next Retry */}
              {diagnostics?.nextRetryAt && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Next Retry</span>
                  <span className="text-sm">
                    {formatDate(diagnostics.nextRetryAt)}
                  </span>
                </div>
              )}

              {/* Retry Count / Consecutive Failures */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600">Consecutive Failures</span>
                <span className={`text-sm font-medium ${
                  (diagnostics?.consecutiveFailures || 0) > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {diagnostics?.consecutiveFailures || 0}
                </span>
              </div>

              {/* Last Failed Request */}
              {diagnostics?.lastFailedRequestId && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="text-red-500" size={16} />
                    <span className="text-sm font-medium text-red-700">Last Failed Request</span>
                  </div>
                  <div className="space-y-1 text-xs text-red-600">
                    <p>Request ID: {diagnostics.lastFailedRequestId}</p>
                    {diagnostics.lastFailedRequestDeviceId && (
                      <p>Device ID: {diagnostics.lastFailedRequestDeviceId}</p>
                    )}
                  </div>
                </div>
              )}

              {/* No issues */}
              {(!diagnostics?.consecutiveFailures || diagnostics.consecutiveFailures === 0) && (
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                  <CheckCircle className="text-green-500" size={18} />
                  <span className="text-sm text-green-700">No sync issues detected</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex justify-between">
          <button
            onClick={loadDiagnostics}
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
    </div>
  );
});
