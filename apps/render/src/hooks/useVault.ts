import { vaultStore } from '../stores/vault.store';

export function useVault() {
  return vaultStore.use();
}
