import { Service } from 'typedi';
import type { RequestHandler } from 'express';
import { generateId } from '../utils/id.js';
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
      // Extract or generate request ID
      const requestId = (req.headers['x-request-id'] as string) || generateId();
      const deviceId = req.headers['x-device-id'] as string | undefined;

      // Attach to request for downstream use
      req.requestId = requestId;
      req.deviceId = deviceId ?? null;

      // Set response header for tracing
      res.setHeader('X-Request-ID', requestId);

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
