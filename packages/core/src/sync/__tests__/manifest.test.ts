import { ManifestManager } from '../manifest';
import type { SyncManifest, SyncManifestFileEntry } from '@aimo-note/dto';

const mockAdapter = {
  getObject: jest.fn(),
  putObject: jest.fn(),
  exists: jest.fn(),
};

describe('ManifestManager', () => {
  let manifestManager: ManifestManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manifestManager = new ManifestManager(mockAdapter as any, 'device-001');
  });

  describe('load', () => {
    it('should return empty manifest when no manifest exists', async () => {
      mockAdapter.getObject.mockResolvedValueOnce(null);

      const manifest = await manifestManager.load();
      expect(manifest.files).toEqual({});
      expect(manifest.deviceId).toBe('device-001');
    });

    it('should parse existing manifest JSON', async () => {
      const existing: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-001',
        files: {
          'note1.md': { hash: 'sha256:abc', version: 'v1', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };
      mockAdapter.getObject.mockResolvedValueOnce(JSON.stringify(existing));

      const manifest = await manifestManager.load();
      expect(manifest.files['note1.md'].hash).toBe('sha256:abc');
    });
  });

  describe('save', () => {
    it('should serialize and upload manifest', async () => {
      await manifestManager.save({ version: '1', updatedAt: '2026-04-20T10:00:00Z', deviceId: 'device-001', files: {} });

      expect(mockAdapter.putObject).toHaveBeenCalledWith(
        '.aimo/manifest.json',
        expect.stringContaining('"version": "1"')
      );
    });

    it('should update file entry', async () => {
      const entry: SyncManifestFileEntry = {
        hash: 'sha256:xyz',
        version: 'v2',
        updatedAt: '2026-04-20T11:00:00Z',
      };

      await manifestManager.save({
        version: '1',
        updatedAt: '2026-04-20T11:00:00Z',
        deviceId: 'device-001',
        files: { 'note1.md': entry },
      });

      const savedJson = JSON.parse(mockAdapter.putObject.mock.calls[0][1]);
      expect(savedJson.files['note1.md'].hash).toBe('sha256:xyz');
      expect(savedJson.files['note1.md'].version).toBe('v2');
    });
  });

  describe('updateEntry', () => {
    it('should create new entry for new file', async () => {
      mockAdapter.getObject.mockResolvedValueOnce(null); // empty manifest
      mockAdapter.putObject.mockResolvedValueOnce(undefined);

      await manifestManager.updateEntry('note1.md', 'sha256:abc', 'v1');

      const savedJson = JSON.parse(mockAdapter.putObject.mock.calls[0][1]);
      expect(savedJson.files['note1.md'].hash).toBe('sha256:abc');
      expect(savedJson.files['note1.md'].version).toBe('v1');
    });

    it('should update existing entry', async () => {
      const existing: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-001',
        files: {
          'note1.md': { hash: 'sha256:old', version: 'v1', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };
      mockAdapter.getObject.mockResolvedValueOnce(JSON.stringify(existing));
      mockAdapter.putObject.mockResolvedValueOnce(undefined);

      await manifestManager.updateEntry('note1.md', 'sha256:new', 'v2');

      const savedJson = JSON.parse(mockAdapter.putObject.mock.calls[0][1]);
      expect(savedJson.files['note1.md'].hash).toBe('sha256:new');
      expect(savedJson.files['note1.md'].version).toBe('v2');
    });
  });

  describe('removeEntry', () => {
    it('should mark file as deleted', async () => {
      const existing: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-001',
        files: {
          'note1.md': { hash: 'sha256:abc', version: 'v1', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };
      mockAdapter.getObject.mockResolvedValueOnce(JSON.stringify(existing));
      mockAdapter.putObject.mockResolvedValueOnce(undefined);

      await manifestManager.removeEntry('note1.md', 'sha256:abc');

      const savedJson = JSON.parse(mockAdapter.putObject.mock.calls[0][1]);
      expect(savedJson.files['note1.md'].isDeleted).toBe(true);
    });
  });

  describe('diff', () => {
    it('should detect files only in local', async () => {
      const local: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-001',
        files: {
          'note1.md': { hash: 'sha256:a', version: 'v1', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };
      const remote: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-002',
        files: {},
      };

      const result = manifestManager.diff(local, remote);
      expect(result.toUpload).toContain('note1.md');
      expect(result.toDownload).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it('should detect files only in remote', async () => {
      const local: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-001',
        files: {},
      };
      const remote: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-002',
        files: {
          'note1.md': { hash: 'sha256:a', version: 'v1', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };

      const result = manifestManager.diff(local, remote);
      expect(result.toDownload).toContain('note1.md');
      expect(result.toUpload).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it('should detect conflicts when hashes differ', async () => {
      const local: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-001',
        files: {
          'note1.md': { hash: 'sha256:local', version: 'v1', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };
      const remote: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-002',
        files: {
          'note1.md': { hash: 'sha256:remote', version: 'v1', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };

      const result = manifestManager.diff(local, remote);
      expect(result.conflicts).toContain('note1.md');
      expect(result.toUpload).toEqual([]);
      expect(result.toDownload).toEqual([]);
    });

    it('should detect updated versions when same hash but different version', async () => {
      const local: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-001',
        files: {
          'note1.md': { hash: 'sha256:same', version: 'v2', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };
      const remote: SyncManifest = {
        version: '1',
        updatedAt: '2026-04-20T10:00:00Z',
        deviceId: 'device-002',
        files: {
          'note1.md': { hash: 'sha256:same', version: 'v1', updatedAt: '2026-04-20T10:00:00Z' },
        },
      };

      const result = manifestManager.diff(local, remote);
      expect(result.toUpload).toContain('note1.md');
      expect(result.conflicts).toEqual([]);
      expect(result.toDownload).toEqual([]);
    });
  });
});
