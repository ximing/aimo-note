import { Service } from 'typedi';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { vaults, type Vault, type NewVault } from '../db/schema/vaults.js';
import { vaultMembers, type VaultMember } from '../db/schema/vault-members.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';

export class VaultNotFoundError extends Error {
  code = ErrorCodes.RESOURCE_NOT_FOUND;
  constructor(vaultId: string) {
    super(`Vault not found: ${vaultId}`);
    this.name = 'VaultNotFoundError';
  }
}

export class VaultAccessDeniedError extends Error {
  code = ErrorCodes.ACCESS_DENIED;
  constructor(userId: string, vaultId: string) {
    super(`Access denied: user ${userId} does not have access to vault ${vaultId}`);
    this.name = 'VaultAccessDeniedError';
  }
}

@Service()
export class VaultService {
  /**
   * Create a new vault with owner member record
   */
  async createVault(
    userId: string,
    name: string,
    description?: string
  ): Promise<Vault> {
    const db = getDb();
    const now = new Date();
    const vaultId = generateId();
    const memberId = generateId();

    // Create the vault
    const newVault: NewVault = {
      id: vaultId,
      ownerUserId: userId,
      name,
      description: description ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(vaults).values(newVault);

    // Create owner member record
    await db.insert(vaultMembers).values({
      id: memberId,
      vaultId,
      userId,
      role: 'owner',
      createdAt: now,
    });

    logger.info('Vault created', { vaultId, userId, name });

    // Return the created vault
    const createdVault = await this.findById(vaultId);
    return createdVault!;
  }

  /**
   * Query user vault list (vaults where user is a member)
   */
  async getUserVaults(userId: string): Promise<Vault[]> {
    const db = getDb();

    // Get all vaults where user is a member
    const result = await db
      .select({
        vault: vaults,
      })
      .from(vaultMembers)
      .innerJoin(vaults, eq(vaults.id, vaultMembers.vaultId))
      .where(eq(vaultMembers.userId, userId));

    return result.map((row) => row.vault);
  }

  /**
   * Find vault by ID
   */
  async findById(vaultId: string): Promise<Vault | null> {
    const db = getDb();
    const result = await db.select().from(vaults).where(eq(vaults.id, vaultId)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Get vault members
   */
  async getVaultMembers(vaultId: string): Promise<VaultMember[]> {
    const db = getDb();
    return db.select().from(vaultMembers).where(eq(vaultMembers.vaultId, vaultId));
  }

  /**
   * Assert that a user has access to a vault
   * Throws VaultAccessDeniedError if not
   */
  async assertVaultOwnership(userId: string, vaultId: string): Promise<void> {
    const db = getDb();
    const result = await db
      .select()
      .from(vaultMembers)
      .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)))
      .limit(1);

    if (result.length === 0) {
      throw new VaultAccessDeniedError(userId, vaultId);
    }
  }

  /**
   * Check if user is a member of a vault
   */
  async isMember(userId: string, vaultId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .select()
      .from(vaultMembers)
      .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)))
      .limit(1);

    return result.length > 0;
  }
}
