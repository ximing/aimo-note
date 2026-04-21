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
  getAllTrackedPaths: jest.fn(),
  getVersion: jest.fn(),
  getFileHistory: jest.fn(),
  createVersion: jest.fn(),
};

const mockChangeLogger = {
  getUnsyncedEntries: jest.fn(),
  markSynced: jest.fn(),
};

const mockConflictManager = {
  record: jest.fn().mockReturnValue({ id: 1 }),
  resolve: jest.fn(),
  generateConflictFilename: jest.fn((path) => path.replace('.md', '_conflict_20260421_000000_0000.md')),
  getUnresolved: jest.fn(),
  getUnresolvedForFile: jest.fn(),
  getById: jest.fn(),
};

describe('SyncEngine', () => {
  let engine: SyncEngine;
  const deviceId = 'device-001';
  const vaultPath = '/tmp/aimo-sync-test';

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new SyncEngine(
      mockAdapter as any,
      mockVersionManager as any,
      mockChangeLogger as any,
      deviceId,
      mockConflictManager as any,
      vaultPath
    );
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
      mockVersionManager.getAllTrackedPaths.mockReturnValue(['note1.md']);
      mockVersionManager.getLatestVersion.mockReturnValue({
        filePath: 'note1.md',
        hash: 'sha256:local',
        version: 'v1',
        isDeleted: false,
      });
      mockVersionManager.getVersionContent.mockReturnValue('local content');
      mockChangeLogger.getUnsyncedEntries.mockReturnValue([]);

      const result = await engine.sync();

      expect(result.conflicts).toContain('note1.md');
      // With ConflictManager wired in, the local version IS uploaded during conflict
      // so both versions exist remotely (local at original path, remote at conflict file)
      expect(mockAdapter.putObject).toHaveBeenCalled();
      expect(result.uploaded).toContain('note1.md');
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
      mockVersionManager.getAllTrackedPaths.mockReturnValue(['note1.md']);
      mockVersionManager.getLatestVersion.mockReturnValue({
        filePath: 'note1.md',
        hash: 'sha256:local',
        version: 'v1',
        contentPath: '/tmp/v1.content',
        isDeleted: false,
      });
      mockVersionManager.getVersionContent.mockReturnValue('local content');
      mockChangeLogger.getUnsyncedEntries.mockReturnValue([]);

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
      // Use chained mockResolvedValueOnce for deterministic call-order handling
      mockAdapter.getObject
        .mockResolvedValueOnce(JSON.stringify(remoteManifest)) // load() → manifest
        .mockResolvedValueOnce('remote content')              // downloadVersion → content
        .mockResolvedValueOnce(JSON.stringify(metadata));      // downloadVersion → metadata json
      mockAdapter.listObjects.mockResolvedValue([]);
      mockVersionManager.getAllTrackedPaths.mockReturnValue([]);
      mockVersionManager.createVersion.mockReturnValue({} as any);

      const result = await engine.sync();

      expect(result.downloaded).toContain('note1.md');
    });
  });
});
