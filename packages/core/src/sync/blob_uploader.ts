/**
 * BlobUploader - Handles blob upload to server via presigned URLs
 *
 * Flow:
 * 1. Check which blobs exist via hasBlobs
 * 2. For missing blobs, request presigned upload URLs
 * 3. Upload blobs directly to presigned URLs
 * 4. Return upload results
 */

import type { ServerAdapter } from './server_adapter';

export interface BlobToUpload {
  blobHash: string;
  content: ArrayBuffer;
  mimeType: string;
  sizeBytes: number;
}

export interface BlobUploadResult {
  blobHash: string;
  success: boolean;
  error?: string;
}

export class BlobUploader {
  constructor(private serverAdapter: ServerAdapter) {}

  /**
   * Check which blobs already exist on the server
   */
  async checkExistingBlobs(vaultId: string, blobHashes: string[]): Promise<Set<string>> {
    if (blobHashes.length === 0) {
      return new Set();
    }

    try {
      const response = await this.serverAdapter.hasBlobs({ vaultId, blobHashes });
      const existingHashes = new Set<string>();

      for (const result of response.results) {
        if (result.exists) {
          existingHashes.add(result.blobHash);
        }
      }

      return existingHashes;
    } catch (error) {
      console.error('[BlobUploader] Failed to check existing blobs:', error);
      throw error;
    }
  }

  /**
   * Upload a single blob to a presigned URL
   */
  private async uploadToPresignedUrl(
    uploadUrl: string,
    content: ArrayBuffer,
    mimeType: string,
    extraHeaders?: Record<string, string>
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      ...extraHeaders,
    };

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers,
      body: content,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: HTTP ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Upload missing blobs to the server
   *
   * @param vaultId - The vault ID
   * @param blobsToUpload - Array of blobs that need uploading
   * @param onProgress - Optional progress callback (blobHash, uploaded, total)
   * @returns Array of upload results
   */
  async uploadBlobs(
    vaultId: string,
    blobsToUpload: BlobToUpload[],
    onProgress?: (blobHash: string, uploaded: number, total: number) => void
  ): Promise<BlobUploadResult[]> {
    const results: BlobUploadResult[] = [];
    const total = blobsToUpload.length;
    let uploaded = 0;

    for (const blob of blobsToUpload) {
      try {
        // Get presigned upload URL
        const urlResponse = await this.serverAdapter.createBlobUploadUrl({
          vaultId,
          blobHash: blob.blobHash,
          sizeBytes: blob.sizeBytes,
          mimeType: blob.mimeType,
        });

        // Upload to presigned URL
        await this.uploadToPresignedUrl(
          urlResponse.uploadUrl,
          blob.content,
          blob.mimeType,
          urlResponse.headers
        );

        results.push({
          blobHash: blob.blobHash,
          success: true,
        });

        uploaded++;
        onProgress?.(blob.blobHash, uploaded, total);
      } catch (error) {
        console.error(`[BlobUploader] Failed to upload blob ${blob.blobHash}:`, error);
        results.push({
          blobHash: blob.blobHash,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Upload blobs, skipping those that already exist on the server
   *
   * @param vaultId - The vault ID
   * @param blobsToUpload - All blobs that might need uploading
   * @param onProgress - Optional progress callback
   * @returns Object with uploaded, skipped, and failed blobs
   */
  async uploadMissingBlobs(
    vaultId: string,
    blobsToUpload: BlobToUpload[],
    onProgress?: (blobHash: string, uploaded: number, total: number) => void
  ): Promise<{
    uploaded: string[];
    skipped: string[];
    failed: Array<{ blobHash: string; error: string }>;
  }> {
    // Step 1: Check which blobs already exist
    const blobHashes = blobsToUpload.map((b) => b.blobHash);
    const existingBlobs = await this.checkExistingBlobs(vaultId, blobHashes);

    // Separate blobs into those that need upload vs already exist
    const blobsToUploadNow: BlobToUpload[] = [];
    const skipped: string[] = [];

    for (const blob of blobsToUpload) {
      if (existingBlobs.has(blob.blobHash)) {
        skipped.push(blob.blobHash);
      } else {
        blobsToUploadNow.push(blob);
      }
    }

    // Step 2: Upload missing blobs
    const uploadResults = await this.uploadBlobs(vaultId, blobsToUploadNow, onProgress);

    // Step 3: Collect results
    const uploaded: string[] = [];
    const failed: Array<{ blobHash: string; error: string }> = [];

    for (const result of uploadResults) {
      if (result.success) {
        uploaded.push(result.blobHash);
      } else {
        failed.push({
          blobHash: result.blobHash,
          error: result.error ?? 'Unknown error',
        });
      }
    }

    return { uploaded, skipped, failed };
  }
}
