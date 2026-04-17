import { Service } from '@rabjs/react';

export interface VaultState {
  path: string | null;
  files: Map<string, unknown>;
  folders: string[];
  activeFile: string | null;
}

class VaultService extends Service<VaultState> {
  protected state: VaultState = {
    path: null,
    files: new Map(),
    folders: [],
    activeFile: null,
  };

  async openVault(path: string): Promise<void> {
    this.state.path = path;
    this.notify();
  }

  async refreshVault(): Promise<void> {
    // TODO: implement via IPC vault
  }
}

export const vaultService = new VaultService();
export function useVaultService() {
  return vaultService.use();
}
