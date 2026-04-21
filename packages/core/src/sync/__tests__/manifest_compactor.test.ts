// packages/core/src/sync/__tests__/manifest_compactor.test.ts
import { ManifestCompactor } from '../manifest_compactor';
import { ManifestManager } from '../manifest';
import type { S3Adapter } from '../adapter';
import type { SyncManifest } from '@aimo-note/dto';

const mockAdapter = {
  getObject: jest.fn(),
  putObject: jest.fn(),
};

describe('ManifestCompactor', () => {
  let manifestManager: ManifestManager;
  let compactor: ManifestCompactor;

  beforeEach(() => {
    jest.clearAllMocks();
    manifestManager = new ManifestManager(mockAdapter as any, 'device-001');
    compactor = new ManifestCompactor(mockAdapter as any, manifestManager);
  });

  describe('compact', () => {
    it('should remove entries for deleted files older than maxAgeDays', async () => {
      // Remote manifest has note1.md (recent deleted), note2.md (old deleted), note3.md (non-deleted)
      const remoteManifest: SyncManifest = {
        version: '1',
        updatedAt: new Date().toISOString(),
        deviceId: 'device-002',
        files: {
          'note1.md': { hash: 'sha256:abc', version: 'v1', updatedAt: new Date().toISOString(), isDeleted: true },
          'note2.md': { hash: 'sha256:old', version: 'v1', updatedAt: '2026-01-01T00:00:00.000Z', isDeleted: true },
          'note3.md': { hash: 'sha256:def', version: 'v1', updatedAt: new Date().toISOString(), isDeleted: false },
        },
      };

      mockAdapter.getObject.mockResolvedValue(JSON.stringify(remoteManifest));
      mockAdapter.putObject.mockResolvedValue(undefined);

      const result = await compactor.compact({ maxAgeDays: 30 });

      expect(result.entriesRemoved).toBe(1);
      expect(mockAdapter.putObject).toHaveBeenCalled();
      const savedManifest = JSON.parse(mockAdapter.putObject.mock.calls[0][1] as string);
      expect(savedManifest.files['note2.md']).toBeUndefined(); // old deleted → removed
      expect(savedManifest.files['note1.md']).toBeDefined();  // recent deleted → kept
      expect(savedManifest.files['note3.md']).toBeDefined();  // non-deleted → kept
    });

    it('should return size before and after', async () => {
      // Create manifest with entries marked deleted and updated long ago
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60); // 60 days ago
      const oldDateStr = oldDate.toISOString();

      const largeManifest: SyncManifest = {
        version: '1',
        updatedAt: new Date().toISOString(),
        deviceId: 'device-002',
        files: {},
      };
      // Add 50 entries that are old deleted entries
      for (let i = 0; i < 50; i++) {
        largeManifest.files[`note${i}.md`] = {
          hash: `sha256:hash${i}`,
          version: `v${i}`,
          updatedAt: oldDateStr,
          isDeleted: true,
        };
      }
      // Add 50 entries that are recent and not deleted
      for (let i = 50; i < 100; i++) {
        largeManifest.files[`note${i}.md`] = {
          hash: `sha256:hash${i}`,
          version: `v${i}`,
          updatedAt: new Date().toISOString(),
          isDeleted: false,
        };
      }

      const inputJson = JSON.stringify(largeManifest);
      mockAdapter.getObject.mockResolvedValue(inputJson);
      mockAdapter.putObject.mockResolvedValue(undefined);

      const result = await compactor.compact({ maxAgeDays: 30 });

      expect(result.entriesRemoved).toBe(50);
      expect(result.sizeBefore).toBe(inputJson.length);
      expect(result.sizeAfter).toBeLessThan(result.sizeBefore);
    });

    it('should not modify manifest if no entries to remove', async () => {
      const manifest: SyncManifest = {
        version: '1',
        updatedAt: new Date().toISOString(),
        deviceId: 'device-002',
        files: {
          'note1.md': { hash: 'sha256:abc', version: 'v1', updatedAt: new Date().toISOString(), isDeleted: true },
        },
      };
      mockAdapter.getObject.mockResolvedValue(JSON.stringify(manifest));

      const result = await compactor.compact({ maxAgeDays: 30 });

      expect(result.entriesRemoved).toBe(0);
      expect(mockAdapter.putObject).not.toHaveBeenCalled();
    });

    it('should keep non-deleted entries even if very old', async () => {
      const manifest: SyncManifest = {
        version: '1',
        updatedAt: new Date().toISOString(),
        deviceId: 'device-002',
        files: {
          'note1.md': { hash: 'sha256:abc', version: 'v1', updatedAt: '2020-01-01T00:00:00.000Z', isDeleted: false },
        },
      };
      mockAdapter.getObject.mockResolvedValue(JSON.stringify(manifest));

      const result = await compactor.compact({ maxAgeDays: 30 });

      expect(result.entriesRemoved).toBe(0);
      // putObject should not be called since nothing was removed
      expect(mockAdapter.putObject).not.toHaveBeenCalled();
    });
  });
});