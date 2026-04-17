import { useNavigate } from 'react-router';
import { useVaultService } from '../../services';
import { VaultTree } from '@/components/explorer/VaultTree';

export function HomePage() {
  const vaultService = useVaultService();
  const navigate = useNavigate();
  const { path, isLoading } = vaultService;

  const handleOpenVault = async () => {
    const success = await vaultService.selectAndOpenVault();
    if (success) {
      navigate('/editor');
    }
  };

  const handleCreateVault = async () => {
    const success = await vaultService.createAndOpenVault();
    if (success) {
      navigate('/editor');
    }
  };

  if (isLoading) {
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

        {!path ? (
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
          </div>
        ) : (
          <div className="w-full mt-4">
            <p className="text-sm text-muted-foreground mb-2">Current vault:</p>
            <p className="font-mono text-sm bg-muted px-3 py-2 rounded mb-4">{path}</p>
            <VaultTree />
          </div>
        )}
      </div>
    </div>
  );
}
