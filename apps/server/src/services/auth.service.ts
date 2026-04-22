import { Service } from 'typedi';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { users } from '../db/schema/users.js';
import { authSessions } from '../db/schema/auth-sessions.js';
import { getConfig } from '../config/config.js';
import { generateId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ErrorCodes } from '../constants/error-codes.js';
import type { AuthenticatedUser } from '../types/express.js';
import type { AuthTokensResponse } from '../types/response.js';

export class AuthError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 401) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.name = 'AuthError';
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid email or password', 401);
  }
}

export class RegistrationDisabledError extends AuthError {
  constructor() {
    super(ErrorCodes.AUTH_REGISTRATION_DISABLED, 'Registration is disabled', 403);
  }
}

export class EmailAlreadyExistsError extends AuthError {
  constructor() {
    super(ErrorCodes.AUTH_EMAIL_ALREADY_EXISTS, 'Email is already registered', 409);
  }
}

export class TokenExpiredError extends AuthError {
  constructor() {
    super(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Token has expired', 401);
  }
}

export class TokenInvalidError extends AuthError {
  constructor() {
    super(ErrorCodes.AUTH_TOKEN_INVALID, 'Invalid token', 401);
  }
}

interface JWTPayload {
  userId: string;
  email: string;
}

@Service()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  /**
   * Register a new user
   */
  async register(
    email: string,
    password: string,
    username: string
  ): Promise<AuthenticatedUser> {
    const config = getConfig();

    if (!config.allowRegistration) {
      throw new RegistrationDisabledError();
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AuthError(ErrorCodes.VALIDATION_ERROR, 'Invalid email format', 400);
    }

    // Check if email already exists
    const existingUser = await this.findUserByEmail(email);
    if (existingUser) {
      throw new EmailAlreadyExistsError();
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);
    const now = new Date();

    // Create user
    const userId = generateId();
    const db = getDb();
    await db.insert(users).values({
      id: userId,
      email: email.toLowerCase(),
      passwordHash,
      username,
      createdAt: now,
      updatedAt: now,
    });

    logger.info('User registered', { userId, email });

    return {
      id: userId,
      email: email.toLowerCase(),
      username,
      avatar: null,
    };
  }

  /**
   * Login user with email and password
   */
  async login(email: string, password: string): Promise<AuthTokensResponse> {
    const user = await this.findUserByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new InvalidCredentialsError();
    }

    const config = getConfig();
    const accessToken = this.generateAccessToken(user.id, user.email);
    const expiresIn = this.parseExpiresIn(config.jwt.expiresIn);

    logger.info('User logged in', { userId: user.id, email: user.email });

    return {
      accessToken,
      expiresIn,
    };
  }

  /**
   * Logout user (revoke all sessions)
   */
  async logout(userId: string): Promise<void> {
    const db = getDb();

    // Revoke all sessions for the user
    await db
      .update(authSessions)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(authSessions.userId, userId));

    logger.info('User logged out', { userId });
  }

  /**
   * Get current authenticated user
   */
  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new AuthError(ErrorCodes.USER_NOT_FOUND, 'User not found', 404);
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
    };
  }

  /**
   * Verify JWT token and return user info
   */
  async verifyToken(token: string): Promise<AuthenticatedUser> {
    const config = getConfig();

    try {
      const payload = jwt.verify(token, config.jwt.secret) as JWTPayload;
      const user = await this.findUserById(payload.userId);

      if (!user) {
        throw new TokenInvalidError();
      }

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredError();
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new TokenInvalidError();
      }
      throw error;
    }
  }

  /**
   * Generate access token (JWT)
   */
  private generateAccessToken(userId: string, email: string): string {
    const config = getConfig();
    return jwt.sign(
      { userId, email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
    );
  }

  /**
   * Parse expires-in string (e.g., "7d") to seconds
   */
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 3600; // Default 1 hour
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 3600;
    }
  }

  /**
   * Find user by ID
   */
  private async findUserById(userId: string) {
    const db = getDb();
    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return result[0] ?? null;
  }

  /**
   * Find user by email
   */
  private async findUserByEmail(email: string) {
    const db = getDb();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return result[0] ?? null;
  }
}
