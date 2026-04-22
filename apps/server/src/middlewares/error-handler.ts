import { Service } from 'typedi';
import type { ErrorRequestHandler } from 'express';
import { getConfig } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { ResponseUtil } from '../utils/response.js';
import type { AuthenticatedRequest } from '../types/express.js';

/**
 * Global error handler middleware
 * Handles all errors thrown during request processing
 */
@Service()
export class ErrorHandlerMiddleware {
  /**
   * Middleware handler for global error handling
   */
  getMiddleware(): ErrorRequestHandler {
    return (
      err: Error & { httpCode?: number; code?: string; details?: unknown; statusCode?: number },
      req: AuthenticatedRequest,
      res: any,
      _next: any
    ) => {
      const config = (() => {
        try {
          return getConfig();
        } catch {
          return { env: 'development' };
        }
      })();

      // Determine status code
      const statusCode = err.httpCode || err.statusCode || 500;
      const errorCode = err.code || 'INTERNAL_ERROR';

      // Log the error
      logger.error('Request error', {
        requestId: req.requestId,
        deviceId: req.deviceId,
        userId: req.user?.id,
        errorCode,
        statusCode,
        message: err.message,
        stack: config.env !== 'production' ? err.stack : undefined,
      });

      // Determine error message (hide details in production for 500 errors)
      const message = statusCode === 500 ? 'Internal Server Error' : err.message;

      // Send error response
      ResponseUtil.error(res, errorCode, message, statusCode, err.details);
    };
  }
}

