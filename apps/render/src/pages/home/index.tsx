import { useVault } from '../../hooks/useVault';

export function HomePage() {
  const { path } = useVault();

  return (
    <div className="home-page p-4">
      <h1 className="text-2xl font-bold mb-4">Welcome to AIMO-Note</h1>
      {!path ? (
        <div className="open-vault-prompt">
          <p className="mb-4">No vault open. Select a folder to get started.</p>
          <button className="btn btn-primary">Open Vault</button>
        </div>
      ) : (
        <div className="vault-content">
          <p>Vault: {path}</p>
          {/* Recent files, daily notes, etc. */}
        </div>
      )}
    </div>
  );
}
