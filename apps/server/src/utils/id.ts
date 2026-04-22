import { ulid } from 'ulid';

/**
 * Generate a unique ID using ULID (Universally Unique Lexicographically Sortable Identifier)
 * ULIDs are time-based, URL-safe, and sort lexicographically
 */
export function generateId(): string {
  return ulid();
}
