import { vaultService } from '../services/vault.service';

export function useVault() {
  return vaultService.use();
}
