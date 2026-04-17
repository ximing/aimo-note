import { Service } from '@rabjs/react';

export interface VaultState {
  path: string | null;
  files: Map<string, unknown>;
  folders: string[];
  activeFile: string | null;
}

class VaultStore extends Service<VaultState> {
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
    // TODO: implement via vault service
  }
}

export const vaultStore = new VaultStore();
export function useVaultStore() {
  return vaultStore.use();
}
