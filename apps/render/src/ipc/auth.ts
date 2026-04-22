/**
 * Auth IPC wrapper
 *
 * Handles authentication via secure storage and server communication.
 */

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  user?: AuthUser;
  error?: string;
}

export interface RegisterResult {
  success: boolean;
  token?: string;
  user?: AuthUser;
  error?: string;
}

const AUTH_TOKEN_KEY = 'auth_token';

export const auth = {
  /**
   * Get stored auth token
   */
  async getToken(): Promise<{ success: boolean; value: string | null; error?: string }> {
    return window.electronAPI!.secureStoreGet(AUTH_TOKEN_KEY);
  },

  /**
   * Store auth token securely
   */
  async setToken(token: string): Promise<{ success: boolean; warning?: string; error?: string }> {
    return window.electronAPI!.secureStoreSet(AUTH_TOKEN_KEY, token);
  },

  /**
   * Delete stored auth token
   */
  async deleteToken(): Promise<{ success: boolean; error?: string }> {
    return window.electronAPI!.secureStoreDelete(AUTH_TOKEN_KEY);
  },

  /**
   * Login with email and password
   */
  async login(
    _email: string,
    _password: string
  ): Promise<LoginResult> {
    // This would call the server API - for now return error as server integration is not yet in preload
    return {
      success: false,
      error: 'Auth API not yet integrated - requires server endpoint configuration',
    };
  },

  /**
   * Register a new user
   */
  async register(
    _email: string,
    _password: string,
    _username: string
  ): Promise<RegisterResult> {
    return {
      success: false,
      error: 'Auth API not yet integrated - requires server endpoint configuration',
    };
  },

  /**
   * Logout current user
   */
  async logout(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.deleteToken();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  /**
   * Get current user info
   */
  async me(): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    return {
      success: false,
      error: 'Auth API not yet integrated',
    };
  },

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const result = await this.getToken();
    return result.success && result.value !== null;
  },
};
