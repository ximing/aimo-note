import { Service } from 'typedi';
import type { RequestHandler } from 'express';
import { AuthService } from '../services/auth.service.js';
import { logger } from '../utils/logger.js';
import type { AuthenticatedRequest } from '../types/express.js';

/**
 * Auth handler middleware
 * Extracts user from JWT in cookie or Authorization header
 * Does not block requests - use @Authorized decorator from routing-controllers for protected routes
 */
@Service()
export class AuthHandlerMiddleware {
  constructor(private readonly authService: AuthService) {}

  /**
   * Middleware handler to extract and validate JWT
   * Attaches user to request if valid token is present
   */
  getMiddleware(): RequestHandler {
    return async (req: AuthenticatedRequest, _res, next) => {
      // Reject missing X-Request-Id for sync endpoints (idempotency requirement)
      if (
        req.requestId === undefined &&
        req.path.startsWith('/api/v1/sync')
      ) {
        const error = new Error('X-Request-Id header is required for sync endpoints');
        (error as any).httpCode = 400;
        throw error;
      }

      try {
        const token = this.extractToken(req);

        if (token) {
          const user = await this.authService.verifyToken(token);
          req.user = user;

          logger.debug('User authenticated from token', {
            requestId: req.requestId,
            userId: user.id,
          });
        }
      } catch (error) {
        // Log but don't block - let the route handler decide if auth is required
        logger.debug('Token validation failed', {
          requestId: req.requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      next();
    };
  }

  /**
   * Extract JWT from cookie or Authorization header
   */
  private extractToken(req: AuthenticatedRequest): string | null {
    // Try Authorization header first (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Fall back to cookie
    if (req.cookies && typeof req.cookies === 'object') {
      return (req.cookies as Record<string, string>).accessToken ?? null;
    }

    return null;
  }
}

