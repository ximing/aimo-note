import { Service } from 'typedi';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { users, type User } from '../db/schema/users.js';
import { ErrorCodes } from '../constants/error-codes.js';
import { logger } from '../utils/logger.js';

export class UserNotFoundError extends Error {
  code = ErrorCodes.USER_NOT_FOUND;
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

@Service()
export class UserService {
  /**
   * Find a user by ID
   */
  async findById(userId: string): Promise<User | null> {
    const db = getDb();
    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Find a user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const db = getDb();
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Get user profile (public information only)
   */
  async getProfile(userId: string): Promise<{ id: string; username: string; avatar: string | null }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    logger.debug('User profile retrieved', { userId });

    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
    };
  }

  /**
   * Check if email is already registered
   */
  async emailExists(email: string): Promise<boolean> {
    const user = await this.findByEmail(email);
    return user !== null;
  }
}
