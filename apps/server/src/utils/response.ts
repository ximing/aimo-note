import type { Response } from 'express';
import type { ApiResponse } from '../types/response.js';

/**
 * Response utility for consistent API responses
 */
export class ResponseUtil {
  /**
   * Send a successful response
   */
  static success<T>(res: Response, data?: T, statusCode = 200): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
    };
    return res.status(statusCode).json(response);
  }

  /**
   * Send an error response
   */
  static error(
    res: Response,
    code: string,
    message: string,
    statusCode = 400,
    details?: unknown
  ): Response {
    const response: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        ...(details !== undefined && { details }),
      },
    };
    return res.status(statusCode).json(response);
  }

  /**
   * Send a created response (201)
   */
  static created<T>(res: Response, data?: T): Response {
    return this.success(res, data, 201);
  }

  /**
   * Send a no content response (204)
   */
  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  /**
   * Send an unauthorized error response (401)
   */
  static unauthorized(res: Response, message = 'Unauthorized'): Response {
    return this.error(res, 'UNAUTHORIZED', message, 401);
  }

  /**
   * Send a forbidden error response (403)
   */
  static forbidden(res: Response, message = 'Forbidden'): Response {
    return this.error(res, 'FORBIDDEN', message, 403);
  }

  /**
   * Send a not found error response (404)
   */
  static notFound(res: Response, message = 'Not found'): Response {
    return this.error(res, 'NOT_FOUND', message, 404);
  }

  /**
   * Send an internal server error response (500)
   */
  static internalError(res: Response, message = 'Internal server error'): Response {
    return this.error(res, 'INTERNAL_ERROR', message, 500);
  }
}
