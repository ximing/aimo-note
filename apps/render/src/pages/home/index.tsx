import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { observer, useService } from '@rabjs/react';
import { VaultTree } from '@/components/explorer/VaultTree';
import { VaultService } from '../../services/vault.service';

const HomePageContent = observer(() => {
  const vaultService = useService(VaultService);
  const navigate = useNavigate();

  useEffect(() => {
    vaultService.loadRecentVaults();
  }, [vaultService]);

  const handleOpenVault = useCallback(async () => {
    const success = await vaultService.selectAndOpenVault();
    if (success) {
      navigate('/editor');
    }
  }, [vaultService, navigate]);

  const handleCreateVault = useCallback(async () => {
    const success = await vaultService.createAndOpenVault();
    if (success) {
      navigate('/editor');
    }
  }, [vaultService, navigate]);

  const handleOpenRecentVault = useCallback(
    async (vaultPath: string) => {
      const success = await vaultService.openRecentVault(vaultPath);
      if (success) {
        navigate('/editor');
      }
    },
    [vaultService, navigate]
  );

  const handleRemoveRecent = useCallback(
    async (e: React.MouseEvent, vaultPath: string) => {
      e.stopPropagation();
      await vaultService.removeRecentVault(vaultPath);
    },
    [vaultService]
  );

  useEffect(() => {
    // Auto-open most recent vault if no vault is open
    if (!vaultService.path && vaultService.recentVaults.length > 0) {
      const mostRecent = vaultService.recentVaults[0];
      handleOpenRecentVault(mostRecent.path);
    }
  }, [vaultService.path, vaultService.recentVaults, handleOpenRecentVault]);

  if (vaultService.isLoading) {
    return (
      <div className="home-page flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-lg">Opening vault...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page flex flex-col items-center justify-center h-full p-8">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold mb-2">AIMO-Note</h1>
        <p className="text-lg text-muted-foreground mb-8">
          A local-first note-taking app with knowledge graph
        </p>

        {!vaultService.path ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={handleOpenVault}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Open Vault
            </button>
            <p className="text-sm text-muted-foreground">or</p>
            <button
              type="button"
              onClick={handleCreateVault}
              className="px-6 py-3 border border-primary text-primary rounded-lg font-medium hover:bg-primary/10 transition-colors"
            >
              Create New Vault
            </button>

            {vaultService.recentVaults.length > 0 && (
              <div className="mt-8">
                <p className="text-sm font-medium text-muted-foreground mb-3">Recent Vaults</p>
                <div className="flex flex-col gap-2 text-left">
                  {vaultService.recentVaults.map((vault) => (
                    <button
                      key={vault.path}
                      type="button"
                      onClick={() => handleOpenRecentVault(vault.path)}
                      className="group flex items-center justify-between px-4 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{vault.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{vault.path}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleRemoveRecent(e, vault.path)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                        title="Remove from recent"
                      >
                        ×
                      </button>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full mt-4">
            <p className="text-sm text-muted-foreground mb-2">Current vault:</p>
            <p className="font-mono text-sm bg-muted px-3 py-2 rounded mb-4">{vaultService.path}</p>
            <VaultTree />
          </div>
        )}
      </div>
    </div>
  );
});

export const HomePage = HomePageContent;
