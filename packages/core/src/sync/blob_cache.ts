/**
 * BlobCache - Local blob storage with SHA-256 layout
 *
 * Layout: blobs/sha256/{hash[0:2]}/{hash}/content
 *
 * Same content produces same hash; duplicate writes return existing path.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

export interface BlobCacheConfig {
  basePath: string;
}

export class BlobCache {
  constructor(private config: BlobCacheConfig) {}

  /**
   * Check if blob exists in cache
   */
  hasBlob(hash: string): boolean {
    const blobPath = this.blobPath(hash);
    return existsSync(blobPath);
  }

  /**
   * Store content and return the blob path.
   * If already exists, return existing path without re-writing.
   */
  putBlob(content: Buffer | ArrayBuffer, hash: string): string {
    const blobPath = this.blobPath(hash);

    if (existsSync(blobPath)) {
      return blobPath;
    }

    // Create directory structure
    const dir = dirname(blobPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write content
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    writeFileSync(blobPath, buffer);

    return blobPath;
  }

  /**
   * Read blob content from cache
   */
  readBlob(hash: string): Buffer | null {
    const blobPath = this.blobPath(hash);

    if (!existsSync(blobPath)) {
      return null;
    }

    return readFileSync(blobPath);
  }

  /**
   * Compute SHA-256 hash of content
   */
  static computeHash(content: Buffer | string): string {
    const buffer = typeof content === 'string' ? Buffer.from(content) : content;
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Get blob path for a given hash
   * Layout: blobs/sha256/{hash[0:2]}/{hash}/content
   */
  private blobPath(hash: string): string {
    const prefix = hash.slice(0, 2);
    return join(this.config.basePath, 'blobs', 'sha256', prefix, hash, 'content');
  }
}