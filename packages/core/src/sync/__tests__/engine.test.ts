import { SyncEngine } from '../engine';
import type { SyncManifest } from '@aimo-note/dto';

const mockAdapter = {
  getObject: jest.fn(),
  putObject: jest.fn(),
  listObjects: jest.fn(),
  exists: jest.fn(),
};

const mockVersionManager = {
  getVersionContent: jest.fn(),
  getLatestVersion: jest.fn(),
  getVersion: jest.fn(),
  getFileHistory: jest.fn(),
  createVersion: jest.fn(),
  getAllTrackedPaths: jest.fn(),
};

const mockChangeLogger = {
  getUnsyncedEntries: jest.fn(),
  markSynced: jest.fn(),
};

describe('SyncEngine', () => {
  let engine: SyncEngine;
  const deviceId = 'device-001';

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new SyncEngine(mockAdapter as any, mockVersionManager as any, mockChangeLogger as any, deviceId);
  });

  describe('sync', () => {
    it('should do nothing when manifests are identical', async () => {
      const manifest: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId,
        files: {},
      };
      mockAdapter.getObject.mockResolvedValue(JSON.stringify(manifest));
      mockAdapter.listObjects.mockResolvedValue([]);
      mockChangeLogger.getUnsyncedEntries.mockReturnValue([]);
      mockVersionManager.getAllTrackedPaths.mockReturnValue([]);

      const result = await engine.sync();

      expect(result.uploaded).toHaveLength(0);
      expect(result.downloaded).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect conflict when local and remote hashes differ', async () => {
      const remoteManifest: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-002',
        files: {
          'note1.md': { hash: 'sha256:remote', version: 'v1', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };
      mockAdapter.getObject.mockResolvedValue(JSON.stringify(remoteManifest));
      mockAdapter.listObjects.mockResolvedValue([]);
      mockChangeLogger.getUnsyncedEntries.mockReturnValue([
        { id: 1, filePath: 'note1.md', operation: 'upsert' as const, version: 'v1', hash: 'sha256:local', createdAt: '2026-04-20T10:00:00Z', deviceId, synced: false },
      ]);
      mockVersionManager.getAllTrackedPaths.mockReturnValue(['note1.md']);
      mockVersionManager.getLatestVersion.mockReturnValue({
        filePath: 'note1.md',
        hash: 'sha256:local',
        version: 'v1',
      });

      const result = await engine.sync();

      expect(result.conflicts).toContain('note1.md');
      // Manifest must be saved even on conflicts-only cycles (Fix #3)
      expect(mockAdapter.putObject).toHaveBeenCalled();
    });

    it('should upload local-only files', async () => {
      const remoteManifest: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-002',
        files: {},
      };
      mockAdapter.getObject.mockResolvedValue(JSON.stringify(remoteManifest));
      mockAdapter.listObjects.mockResolvedValue([]);
      mockChangeLogger.getUnsyncedEntries.mockReturnValue([
        { id: 1, filePath: 'note1.md', operation: 'upsert' as const, version: 'v1', hash: 'sha256:local', createdAt: '2026-04-20T10:00:00Z', deviceId, synced: false },
      ]);
      mockVersionManager.getAllTrackedPaths.mockReturnValue(['note1.md']);
      mockVersionManager.getLatestVersion.mockReturnValue({
        filePath: 'note1.md',
        hash: 'sha256:local',
        version: 'v1',
        contentPath: '/tmp/v1.content',
      });
      mockVersionManager.getVersionContent.mockReturnValue('local content');

      const result = await engine.sync();

      expect(result.uploaded).toContain('note1.md');
      expect(mockAdapter.putObject).toHaveBeenCalledWith(
        '.aimo/versions/note1.md/v1.content',
        'local content'
      );
    });

    it('should download remote-only files', async () => {
      const remoteManifest: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-002',
        files: {
          'note1.md': { hash: 'sha256:remote', version: 'v1', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };
      const metadata = { hash: 'sha256:remote', version: 'v1', createdAt: '2026-04-20T10:00:00Z', deviceId: 'device-002', message: '' };
      let callCount = 0;
      mockAdapter.getObject.mockImplementation((key: string) => {
        callCount++;
        if (key === '.aimo/manifest.json') return Promise.resolve(JSON.stringify(remoteManifest));
        if (key === '.aimo/versions/note1.md/v1.content') return Promise.resolve('remote content');
        if (key === '.aimo/versions/note1.md/v1.json') return Promise.resolve(JSON.stringify(metadata));
        return Promise.resolve(null);
      });
      mockAdapter.listObjects.mockResolvedValue([]);
      mockChangeLogger.getUnsyncedEntries.mockReturnValue([]);
      mockVersionManager.getAllTrackedPaths.mockReturnValue([]);
      mockVersionManager.createVersion.mockReturnValue({} as any);

      const result = await engine.sync();

      expect(result.downloaded).toContain('note1.md');
    });
  });
});
