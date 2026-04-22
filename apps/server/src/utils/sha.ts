import { createHash } from 'crypto';

/**
 * SHA256 hash utility
 * Used for hashing refresh tokens and other sensitive data
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Create a SHA256 hash of a string and return it as a hex string
 * This is a convenience wrapper around sha256
 */
export function hashSha256(data: string): string {
  return sha256(data);
}
