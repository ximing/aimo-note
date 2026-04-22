/**
 * User Isolation Tests
 *
 * These tests verify that the ownership checks properly isolate users from each other's data.
 * Tests cover:
 * 1. User A vault list - User B should get empty list
 * 2. User B trying to commit to User A's vault should fail
 * 3. User B trying to get blob upload URL for User A's vault should fail
 * 4. User B trying to get blob download URL for User A's vault should fail
 * 5. User B trying to ack User A's device cursor should fail
 *
 * Note: These are unit tests that mock the database layer to test ownership logic.
 * Integration tests would require a running MySQL instance.
 */

// Mock the database connection before importing services
jest.mock('../db/connection.js', () => ({
  getDb: jest.fn(),
}));

// Mock the config module
jest.mock('../config/config.js', () => ({
  getConfig: jest.fn(() => ({
    syncS3: {
      region: 'us-east-1',
      endpoint: 'http://localhost:9000',
      accessKeyId: 'test',
      secretAccessKey: 'test',
      bucket: 'test-bucket',
      presignedUrlExpirySeconds: 3600,
      forcePathStyle: true,
    },
    mysql: {
      host: 'localhost',
      port: 3306,
      user: 'test',
      password: 'test',
      database: 'test',
      connectionLimit: 10,
    },
  })),
}));

// Import after mocks are set up
import { VaultService, VaultAccessDeniedError } from '../services/vault.service.js';
import { DeviceService, DeviceAccessDeniedError } from '../services/device.service.js';
import { BlobService } from '../services/blob.service.js';
import { CursorService } from '../services/cursor.service.js';
import { SyncCommitService } from '../services/sync-commit.service.js';
import { AuditService } from '../services/audit.service.js';

// Test data fixtures
const USER_A_ID = 'user-a-123';
const USER_B_ID = 'user-b-456';
const VAULT_A_ID = 'vault-a-789';
const DEVICE_A_ID = 'device-a-101';
const DEVICE_B_ID = 'device-b-102';

describe('User Isolation - VaultService', () => {
  let vaultService: VaultService;
  let mockDb: any;

  beforeEach(() => {
    vaultService = new VaultService();
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    // Set up the mock
    const { getDb } = require('../db/connection.js');
    (getDb as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserVaults', () => {
    it('should return only vaults where user is a member', async () => {
      const mockVaults = [
        { id: VAULT_A_ID, ownerUserId: USER_A_ID, name: 'Vault A', status: 'active' },
      ];

      // Mock: user A is member of vault A
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([
              { vault: mockVaults[0] },
            ]),
          }),
        }),
      });

      const result = await vaultService.getUserVaults(USER_A_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(VAULT_A_ID);
    });

    it('should return empty list when user has no vaults', async () => {
      // Mock: user B is not a member of any vault
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          innerJoin: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await vaultService.getUserVaults(USER_B_ID);

      expect(result).toHaveLength(0);
    });
  });

  describe('assertVaultOwnership', () => {
    it('should throw VaultAccessDeniedError when user is not a member', async () => {
      // Mock: user B is NOT a member of vault A
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]), // Empty result = no membership
        }),
      });

      await expect(
        vaultService.assertVaultOwnership(USER_B_ID, VAULT_A_ID)
      ).rejects.toThrow(VaultAccessDeniedError);
    });

    it('should not throw when user is a member', async () => {
      // Mock: user A is a member of vault A
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { vaultId: VAULT_A_ID, userId: USER_A_ID, role: 'owner' },
          ]),
        }),
      });

      await expect(
        vaultService.assertVaultOwnership(USER_A_ID, VAULT_A_ID)
      ).resolves.toBeUndefined();
    });
  });

  describe('isMember', () => {
    it('should return true when user is a member', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { vaultId: VAULT_A_ID, userId: USER_A_ID },
          ]),
        }),
      });

      const result = await vaultService.isMember(USER_A_ID, VAULT_A_ID);

      expect(result).toBe(true);
    });

    it('should return false when user is not a member', async () => {
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      const result = await vaultService.isMember(USER_B_ID, VAULT_A_ID);

      expect(result).toBe(false);
    });
  });
});

describe('User Isolation - DeviceService', () => {
  let deviceService: DeviceService;
  let vaultService: VaultService;
  let mockDb: any;

  beforeEach(() => {
    vaultService = new VaultService();
    deviceService = new DeviceService(vaultService);
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const { getDb } = require('../db/connection.js');
    (getDb as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assertDeviceOwnership', () => {
    it('should throw DeviceAccessDeniedError when device belongs to different user', async () => {
      // Mock: device A belongs to user A, not user B
      const mockDevice = {
        id: DEVICE_A_ID,
        vaultId: VAULT_A_ID,
        userId: USER_A_ID,
        name: 'Device A',
      };

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockDevice]),
        }),
      });

      // Mock: user B is not a member of vault A (so assertVaultOwnership fails)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(
        deviceService.assertDeviceOwnership(USER_B_ID, DEVICE_A_ID)
      ).rejects.toThrow(DeviceAccessDeniedError);
    });

    it('should not throw when device belongs to the user', async () => {
      // Mock: device A belongs to user A
      const mockDevice = {
        id: DEVICE_A_ID,
        vaultId: VAULT_A_ID,
        userId: USER_A_ID,
        name: 'Device A',
      };

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockDevice]),
        }),
      });

      // Mock: user A is a member of vault A
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { vaultId: VAULT_A_ID, userId: USER_A_ID },
          ]),
        }),
      });

      await expect(
        deviceService.assertDeviceOwnership(USER_A_ID, DEVICE_A_ID)
      ).resolves.toBeUndefined();
    });
  });
});

describe('User Isolation - BlobService', () => {
  let blobService: BlobService;
  let vaultService: VaultService;
  let mockDb: any;

  beforeEach(() => {
    vaultService = new VaultService();
    blobService = new BlobService(vaultService);
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const { getDb } = require('../db/connection.js');
    (getDb as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBlobUploadUrl', () => {
    it('should fail when user is not a member of vault', async () => {
      // Mock: user B is not a member of vault A
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(
        blobService.createBlobUploadUrl(USER_B_ID, VAULT_A_ID, 'abc123', 1024, 'text/plain')
      ).rejects.toThrow(VaultAccessDeniedError);
    });
  });

  describe('createBlobDownloadUrl', () => {
    it('should fail when user is not a member of vault', async () => {
      // Mock: user B is not a member of vault A
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(
        blobService.createBlobDownloadUrl(USER_B_ID, VAULT_A_ID, 'abc123')
      ).rejects.toThrow(VaultAccessDeniedError);
    });
  });

  describe('hasBlobs', () => {
    it('should fail when user is not a member of vault', async () => {
      // Mock: user B is not a member of vault A
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(
        blobService.hasBlobs(USER_B_ID, VAULT_A_ID, ['abc123'])
      ).rejects.toThrow(VaultAccessDeniedError);
    });
  });
});

describe('User Isolation - CursorService', () => {
  let cursorService: CursorService;
  let vaultService: VaultService;
  let deviceService: DeviceService;
  let mockDb: any;

  beforeEach(() => {
    vaultService = new VaultService();
    deviceService = new DeviceService(vaultService);
    cursorService = new CursorService(vaultService, deviceService);
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const { getDb } = require('../db/connection.js');
    (getDb as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ack', () => {
    it('should fail when user is not a member of vault', async () => {
      // Mock: user B is not a member of vault A
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(
        cursorService.ack(USER_B_ID, {
          vaultId: VAULT_A_ID,
          deviceId: DEVICE_A_ID,
          ackedSeq: 1,
        })
      ).rejects.toThrow(VaultAccessDeniedError);
    });

    it('should fail when device belongs to different user', async () => {
      // Mock: vault membership check passes for user A
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { vaultId: VAULT_A_ID, userId: USER_A_ID },
          ]),
        }),
      });

      // Mock: device A belongs to user A, but we're checking user B
      const mockDevice = {
        id: DEVICE_A_ID,
        vaultId: VAULT_A_ID,
        userId: USER_A_ID,
      };

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockDevice]),
        }),
      });

      // Mock: user B is not a member of vault A (device ownership check fails)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(
        cursorService.ack(USER_B_ID, {
          vaultId: VAULT_A_ID,
          deviceId: DEVICE_A_ID,
          ackedSeq: 1,
        })
      ).rejects.toThrow(DeviceAccessDeniedError);
    });
  });
});

describe('User Isolation - SyncCommitService', () => {
  let syncCommitService: SyncCommitService;
  let vaultService: VaultService;
  let deviceService: DeviceService;
  let auditService: AuditService;
  let mockDb: any;

  beforeEach(() => {
    vaultService = new VaultService();
    deviceService = new DeviceService(vaultService);
    auditService = new AuditService();
    syncCommitService = new SyncCommitService(vaultService, deviceService, auditService);
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const { getDb } = require('../db/connection.js');
    (getDb as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('commit', () => {
    it('should fail when user is not a member of vault', async () => {
      // Mock: user B is not a member of vault A
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(
        syncCommitService.commit(USER_B_ID, {
          vaultId: VAULT_A_ID,
          deviceId: DEVICE_A_ID,
          requestId: 'req-123',
          baseSeq: null,
          changes: [
            {
              filePath: 'note.md',
              op: 'upsert',
              blobHash: 'abc123',
              baseRevision: null,
              newRevision: 'v1',
              sizeBytes: 1024,
              metadataJson: '{}',
            },
          ],
        })
      ).rejects.toThrow(VaultAccessDeniedError);
    });

    it('should fail when device belongs to different user', async () => {
      // Mock: vault membership check passes for user A
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([
            { vaultId: VAULT_A_ID, userId: USER_A_ID },
          ]),
        }),
      });

      // Mock: device A belongs to user A, but we're checking user B
      const mockDevice = {
        id: DEVICE_A_ID,
        vaultId: VAULT_A_ID,
        userId: USER_A_ID,
      };

      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockDevice]),
        }),
      });

      // Mock: user B is not a member of vault A (device ownership check fails)
      mockDb.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(
        syncCommitService.commit(USER_B_ID, {
          vaultId: VAULT_A_ID,
          deviceId: DEVICE_A_ID,
          requestId: 'req-123',
          baseSeq: null,
          changes: [
            {
              filePath: 'note.md',
              op: 'upsert',
              blobHash: 'abc123',
              baseRevision: null,
              newRevision: 'v1',
              sizeBytes: 1024,
              metadataJson: '{}',
            },
          ],
        })
      ).rejects.toThrow(DeviceAccessDeniedError);
    });
  });
});

describe('Cross-User Scenario Tests', () => {
  let vaultService: VaultService;
  let deviceService: DeviceService;
  let blobService: BlobService;
  let cursorService: CursorService;
  let syncCommitService: SyncCommitService;
  let auditService: AuditService;
  let mockDb: any;

  beforeEach(() => {
    vaultService = new VaultService();
    deviceService = new DeviceService(vaultService);
    blobService = new BlobService(vaultService);
    cursorService = new CursorService(vaultService, deviceService);
    auditService = new AuditService();
    syncCommitService = new SyncCommitService(vaultService, deviceService, auditService);
    mockDb = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const { getDb } = require('../db/connection.js');
    (getDb as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Scenario: User A creates vault, User B tries to access it
   * Expected: All access attempts by User B should fail
   */
  it('User B cannot access User A vault - vault list', async () => {
    // Mock: user B has no vaults (they only have vault A which belongs to user A)
    mockDb.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }),
    });

    const vaults = await vaultService.getUserVaults(USER_B_ID);
    expect(vaults).toHaveLength(0);
    expect(vaults.find((v: any) => v.id === VAULT_A_ID)).toBeUndefined();
  });

  it('User B cannot access User A vault - blob upload URL', async () => {
    // Mock: user B is not a member of vault A
    mockDb.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    });

    await expect(
      blobService.createBlobUploadUrl(USER_B_ID, VAULT_A_ID, 'abc123', 1024, 'text/plain')
    ).rejects.toThrow(VaultAccessDeniedError);
  });

  it('User B cannot access User A vault - blob download URL', async () => {
    // Mock: user B is not a member of vault A
    mockDb.select.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    });

    await expect(
      blobService.createBlobDownloadUrl(USER_B_ID, VAULT_A_ID, 'abc123')
    ).rejects.toThrow(VaultAccessDeniedError);
  });

  it('User B cannot commit to User A vault', async () => {
    // Mock: user B is not a member of vault A
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    });

    await expect(
      syncCommitService.commit(USER_B_ID, {
        vaultId: VAULT_A_ID,
        deviceId: DEVICE_A_ID,
        requestId: 'req-456',
        baseSeq: null,
        changes: [
          {
            filePath: 'note.md',
            op: 'upsert',
            blobHash: 'abc123',
            baseRevision: null,
            newRevision: 'v1',
            sizeBytes: 1024,
            metadataJson: '{}',
          },
        ],
      })
    ).rejects.toThrow(VaultAccessDeniedError);
  });

  it('User B cannot ack User A device cursor', async () => {
    // Mock: user B is not a member of vault A
    mockDb.select.mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    });

    await expect(
      cursorService.ack(USER_B_ID, {
        vaultId: VAULT_A_ID,
        deviceId: DEVICE_A_ID,
        ackedSeq: 1,
      })
    ).rejects.toThrow(VaultAccessDeniedError);
  });
});
