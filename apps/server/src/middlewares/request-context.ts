import { Service } from 'typedi';
import type { RequestHandler } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Request context middleware
 * Extracts X-Request-Id and X-Device-Id from headers
 * Generates a request ID if not provided
 */
@Service()
export class RequestContextMiddleware {
  /**
   * Middleware handler to extract request context
   */
  getMiddleware(): RequestHandler {
    return (req, res, next) => {
      // Extract request ID from header — do NOT auto-generate; sync endpoints require stable IDs
      const requestId = (req.headers['x-request-id'] as string) || undefined;
      const deviceId = req.headers['x-device-id'] as string | undefined;

      // Attach to request for downstream use
      (req as typeof req & { requestId: string | undefined; deviceId: string | null }).requestId = requestId;
      (req as typeof req & { requestId: string | undefined; deviceId: string | null }).deviceId = deviceId ?? null;

      // Set response header for tracing (only if client provided an ID)
      if (requestId) {
        res.setHeader('X-Request-ID', requestId);
      }

      // Log request
      logger.info('Incoming request', {
        requestId,
        deviceId,
        method: req.method,
        path: req.path,
      });

      next();
    };
  }
}
