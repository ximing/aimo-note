import type { Request } from 'express';
import type { User } from '../db/schema/users.js';

/**
 * Authenticated user attached to the request
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  avatar: string | null;
}

/**
 * Extended Express Request with authentication context
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  requestId?: string;
  deviceId?: string;
}

/**
 * Request context extracted from headers
 */
export interface RequestContext {
  requestId: string | null;
  deviceId: string | null;
}
