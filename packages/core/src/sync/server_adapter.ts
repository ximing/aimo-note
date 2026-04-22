/**
 * ServerAdapter - HTTP client for sync server API
 *
 * Wraps HTTP calls to the sync server with proper auth headers,
 * request ID tracking, and error handling.
 */

import type {
  LoginDto,
  LoginResponseDto,
  RegisterDto,
  CreateVaultDto,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  HasBlobsRequest,
  HasBlobsResponse,
  CreateBlobUploadUrlRequest,
  CreateBlobUploadUrlResponse,
  CreateBlobDownloadUrlRequest,
  CreateBlobDownloadUrlResponse,
  CommitRequest,
  CommitResponse,
  PullResponse,
  AckRequest,
  AckResponse,
} from '@aimo-note/dto';

export interface ServerAdapterConfig {
  baseUrl: string;
  deviceId: string;
  getToken: () => string | null;
}

export class ServerAdapter {
  private baseUrl: string;
  private deviceId: string;
  private getToken: () => string | null;

  constructor(config: ServerAdapterConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.deviceId = config.deviceId;
    this.getToken = config.getToken;
  }

  /**
   * Generate a unique request ID for idempotency
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Make an authenticated HTTP request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: { withoutAuth?: boolean } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': this.generateRequestId(),
      'X-Device-Id': this.deviceId,
    };

    // Add auth token if available and not explicitly skipped
    if (!options.withoutAuth) {
      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorBody = await response.json();
        if (errorBody.error?.message) {
          errorMessage = errorBody.error.message;
        }
      } catch {
        // Response might not be JSON
      }
      throw new Error(errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // =============================================================================
  // Auth API
  // =============================================================================

  /**
   * POST /api/v1/auth/register
   */
  async register(dto: RegisterDto): Promise<LoginResponseDto> {
    return this.request<LoginResponseDto>('/api/v1/auth/register', 'POST', dto, { withoutAuth: true });
  }

  /**
   * POST /api/v1/auth/login
   */
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    return this.request<LoginResponseDto>('/api/v1/auth/login', 'POST', dto, { withoutAuth: true });
  }

  /**
   * POST /api/v1/auth/logout
   */
  async logout(): Promise<void> {
    await this.request<void>('/api/v1/auth/logout', 'POST');
  }

  /**
   * GET /api/v1/auth/me
   */
  async getCurrentUser(): Promise<{ user: { id: string; email: string; username: string } }> {
    return this.request('/api/v1/auth/me', 'GET');
  }

  // =============================================================================
  // Vault API
  // =============================================================================

  /**
   * POST /api/v1/vaults
   */
  async createVault(dto: CreateVaultDto): Promise<{ vault: { id: string; name: string; description?: string } }> {
    return this.request('/api/v1/vaults', 'POST', dto);
  }

  /**
   * GET /api/v1/vaults
   */
  async listVaults(): Promise<{ vaults: Array<{ id: string; name: string; description?: string }> }> {
    return this.request('/api/v1/vaults', 'GET');
  }

  // =============================================================================
  // Device API
  // =============================================================================

  /**
   * POST /api/v1/devices/register
   */
  async registerDevice(dto: RegisterDeviceRequest): Promise<{ device: RegisterDeviceResponse }> {
    return this.request('/api/v1/devices/register', 'POST', dto);
  }

  /**
   * GET /api/v1/devices?vaultId=x
   */
  async listDevices(vaultId: string): Promise<{ devices: RegisterDeviceResponse[] }> {
    return this.request(`/api/v1/devices?vaultId=${encodeURIComponent(vaultId)}`, 'GET');
  }

  // =============================================================================
  // Sync Blob API
  // =============================================================================

  /**
   * POST /api/v1/sync/has-blobs
   * Check which blobs exist in a vault
   */
  async hasBlobs(dto: HasBlobsRequest): Promise<HasBlobsResponse> {
    return this.request<HasBlobsResponse>('/api/v1/sync/has-blobs', 'POST', dto);
  }

  /**
   * POST /api/v1/sync/blob-upload-url
   * Generate a presigned URL for uploading a blob
   */
  async createBlobUploadUrl(dto: CreateBlobUploadUrlRequest): Promise<CreateBlobUploadUrlResponse> {
    return this.request<CreateBlobUploadUrlResponse>('/api/v1/sync/blob-upload-url', 'POST', dto);
  }

  /**
   * POST /api/v1/sync/blob-download-url
   * Generate a presigned URL for downloading a blob
   */
  async createBlobDownloadUrl(dto: CreateBlobDownloadUrlRequest): Promise<CreateBlobDownloadUrlResponse> {
    return this.request<CreateBlobDownloadUrlResponse>('/api/v1/sync/blob-download-url', 'POST', dto);
  }

  // =============================================================================
  // Sync Commit/Pull/Ack API
  // =============================================================================

  /**
   * POST /api/v1/sync/commit
   * Commit a batch of sync changes
   */
  async commit(dto: CommitRequest): Promise<CommitResponse> {
    return this.request<CommitResponse>('/api/v1/sync/commit', 'POST', dto);
  }

  /**
   * GET /api/v1/sync/pull?vaultId=x&sinceSeq=n&limit=n
   * Pull sync commits since a given sequence number
   */
  async pull(vaultId: string, sinceSeq: number, limit?: number): Promise<PullResponse> {
    let url = `/api/v1/sync/pull?vaultId=${encodeURIComponent(vaultId)}&sinceSeq=${sinceSeq}`;
    if (limit !== undefined) {
      url += `&limit=${limit}`;
    }
    return this.request<PullResponse>(url, 'GET');
  }

  /**
   * POST /api/v1/sync/ack
   * Acknowledge that the client has processed up to a certain sequence number
   */
  async ack(dto: AckRequest): Promise<AckResponse> {
    return this.request<AckResponse>('/api/v1/sync/ack', 'POST', dto);
  }
}
