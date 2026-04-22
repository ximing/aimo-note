import { useState, useEffect } from 'react';
import { observer } from '@rabjs/react';
import { Sun, Moon, Monitor, RefreshCw, Cloud, CloudOff, X, Loader2 } from 'lucide-react';
import { useUIService } from '../../services/ui.service';
import type { Theme } from '../../services/ui.service';
import { useImageStorageService } from '../../services/image-storage.service';
import type { ImageStorageConfig, S3ImageStorageConfig } from '../../types/image-storage';
import { TemplateSettings } from './components/TemplateSettings';
import { useSyncService } from '../../services/sync.service';

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

type SettingsTab = 'appearance' | 'image-storage' | 'templates' | 'sync';

const statusLabels: Record<string, string> = {
  DISABLED: 'Disabled',
  IDLE: 'Idle',
  PENDING: 'Pending',
  SYNCING: 'Syncing',
  OFFLINE: 'Offline',
  ERROR: 'Error',
};

export const SettingsPage = observer(() => {
  const uiService = useUIService();
  const imageStorageService = useImageStorageService();
  const syncService = useSyncService();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const currentTheme = uiService.theme;

  // Sync state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerUsername, setRegisterUsername] = useState('');

  // Vault creation
  const [newVaultName, setNewVaultName] = useState('');
  const [isCreatingVault, setIsCreatingVault] = useState(false);

  // Load initial data
  useEffect(() => {
    syncService.checkAuth();
  }, []);

  const handleStorageTypeChange = async (type: 'local' | 's3') => {
    try {
      const newConfig: ImageStorageConfig =
        type === 'local'
          ? { type: 'local', local: { path: 'assets/images' } }
          : {
              type: 's3',
              s3: {
                accessKey: '',
                secretKey: '',
                bucket: '',
                region: 'us-east-1',
                endpoint: '',
                keyPrefix: '',
              },
            };
      await imageStorageService.saveConfig(newConfig);
    } catch (error) {
      console.error('Failed to save image storage config:', error);
    }
  };

  const handleLocalPathChange = (path: string) => {
    if (imageStorageService.config.type !== 'local') return;
    imageStorageService.saveConfig({ type: 'local', local: { path } });
  };

  const handleS3FieldChange = (field: keyof S3ImageStorageConfig['s3'], value: string) => {
    const cfg = imageStorageService.config;
    if (cfg.type !== 's3') return;
    const currentS3 = (cfg as S3ImageStorageConfig).s3;
    imageStorageService.saveConfig({ type: 's3', s3: { ...currentS3, [field]: value } });
  };

  // Sync handlers
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const result = await syncService.login(loginEmail, loginPassword);
    if (!result.success) {
      setLoginError(result.error ?? 'Login failed');
    } else {
      await syncService.loadVaults();
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const result = await syncService.register(loginEmail, loginPassword, registerUsername);
    if (!result.success) {
      setLoginError(result.error ?? 'Registration failed');
    } else {
      await syncService.loadVaults();
    }
  };

  const handleLogout = async () => {
    await syncService.logout();
  };

  const handleCreateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVaultName.trim()) return;

    setIsCreatingVault(true);
    const result = await syncService.createVault(newVaultName.trim());
    setIsCreatingVault(false);

    if (result.success) {
      setNewVaultName('');
      await syncService.loadVaults();
    }
  };

  const handleBindVault = async (vaultId: string, vaultName: string) => {
    await syncService.bindVault(vaultId, vaultName);
  };

  const handleSyncNow = async () => {
    await syncService.syncNow();
  };

  const handleUnbindVault = async () => {
    await syncService.unbindVault();
  };

  return (
    <div className="settings-page p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6 text-text-primary">Settings</h1>

      {/* Tab Navigation */}
      <div className="flex gap-4 mb-6 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('appearance')}
          className={`pb-2 px-1 font-medium ${
            activeTab === 'appearance'
              ? 'border-b-2 border-accent text-accent'
              : 'text-muted-foreground hover:text-text-primary'
          }`}
        >
          Appearance
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('image-storage')}
          className={`pb-2 px-1 font-medium ${
            activeTab === 'image-storage'
              ? 'border-b-2 border-accent text-accent'
              : 'text-muted-foreground hover:text-text-primary'
          }`}
        >
          Image Storage
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sync')}
          className={`pb-2 px-1 font-medium ${
            activeTab === 'sync'
              ? 'border-b-2 border-accent text-accent'
              : 'text-muted-foreground hover:text-text-primary'
          }`}
        >
          Sync
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`pb-2 px-1 font-medium ${
            activeTab === 'templates'
              ? 'border-b-2 border-accent text-accent'
              : 'text-muted-foreground hover:text-text-primary'
          }`}
        >
          Templates
        </button>
      </div>

      {activeTab === 'appearance' && (
        <section className="settings-section mb-8">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">Appearance</h2>
          <div className="grid grid-cols-3 gap-4">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => uiService.setTheme(value)}
                aria-pressed={currentTheme === value}
                className={`
                flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                ${
                  currentTheme === value
                    ? 'border-accent bg-accent-light text-accent'
                    : 'border-border bg-bg-secondary text-text-secondary hover:border-accent/50'
                }
              `}
              >
                <Icon size={24} />
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'image-storage' && (
        <section className="settings-section mb-8">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">Image Storage</h2>

          {/* Storage Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-text-secondary">Storage Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="storageType"
                  checked={imageStorageService.config.type === 'local'}
                  onChange={() => handleStorageTypeChange('local')}
                />
                <span>Local</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="storageType"
                  checked={imageStorageService.config.type === 's3'}
                  onChange={() => handleStorageTypeChange('s3')}
                />
                <span>S3</span>
              </label>
            </div>
          </div>

          {/* Local Path */}
          {imageStorageService.config.type === 'local' && (
            <div className="mb-4">
              <label
                className="block text-sm font-medium mb-2 text-text-secondary"
                htmlFor="local-path"
              >
                Local Path
              </label>
              <input
                id="local-path"
                type="text"
                value={imageStorageService.config.local.path}
                onChange={(e) => handleLocalPathChange(e.target.value)}
                placeholder="assets/images"
                className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
              />
            </div>
          )}

          {/* S3 Config */}
          {imageStorageService.config.type === 's3' && (
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium mb-2 text-text-secondary"
                  htmlFor="s3-accessKey"
                >
                  Access Key
                </label>
                <input
                  id="s3-accessKey"
                  type="text"
                  value={imageStorageService.config.s3.accessKey}
                  onChange={(e) => handleS3FieldChange('accessKey', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2 text-text-secondary"
                  htmlFor="s3-secretKey"
                >
                  Secret Key
                </label>
                <input
                  id="s3-secretKey"
                  type="password"
                  value={imageStorageService.config.s3.secretKey}
                  onChange={(e) => handleS3FieldChange('secretKey', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2 text-text-secondary"
                  htmlFor="s3-bucket"
                >
                  Bucket
                </label>
                <input
                  id="s3-bucket"
                  type="text"
                  value={imageStorageService.config.s3.bucket}
                  onChange={(e) => handleS3FieldChange('bucket', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2 text-text-secondary"
                  htmlFor="s3-region"
                >
                  Region
                </label>
                <input
                  id="s3-region"
                  type="text"
                  value={imageStorageService.config.s3.region}
                  onChange={(e) => handleS3FieldChange('region', e.target.value)}
                  placeholder="us-east-1"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2 text-text-secondary"
                  htmlFor="s3-endpoint"
                >
                  Endpoint (optional)
                </label>
                <input
                  id="s3-endpoint"
                  type="text"
                  value={imageStorageService.config.s3.endpoint}
                  onChange={(e) => handleS3FieldChange('endpoint', e.target.value)}
                  placeholder="https://s3.example.com"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-2 text-text-secondary"
                  htmlFor="s3-keyPrefix"
                >
                  Key Prefix
                </label>
                <input
                  id="s3-keyPrefix"
                  type="text"
                  value={imageStorageService.config.s3.keyPrefix}
                  onChange={(e) => handleS3FieldChange('keyPrefix', e.target.value)}
                  placeholder="2026/04/"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'sync' && (
        <section className="settings-section mb-8">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">Sync</h2>

          {/* Not logged in - show login form */}
          {!syncService.userId && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sign in to sync your vaults across devices.
              </p>

              {isRegistering ? (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="reg-email">
                      Email
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="reg-username">
                      Username
                    </label>
                    <input
                      id="reg-username"
                      type="text"
                      value={registerUsername}
                      onChange={(e) => setRegisterUsername(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="reg-password">
                      Password
                    </label>
                    <input
                      id="reg-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                      required
                    />
                  </div>
                  {loginError && (
                    <p className="text-sm text-red-500">{loginError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={syncService.isLoggingIn}
                      className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
                    >
                      {syncService.isLoggingIn ? 'Creating account...' : 'Create Account'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegistering(false);
                        setLoginError('');
                      }}
                      className="px-4 py-2 border border-border rounded-lg hover:bg-bg-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="login-email">
                      Email
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" htmlFor="login-password">
                      Password
                    </label>
                    <input
                      id="login-password"
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                      required
                    />
                  </div>
                  {loginError && (
                    <p className="text-sm text-red-500">{loginError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={syncService.isLoggingIn}
                      className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
                    >
                      {syncService.isLoggingIn ? 'Signing in...' : 'Sign In'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegistering(true);
                        setLoginError('');
                      }}
                      className="px-4 py-2 border border-border rounded-lg hover:bg-bg-secondary"
                    >
                      Create Account
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Logged in - show vault management */}
          {syncService.userId && (
            <div className="space-y-6">
              {/* User info */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Signed in as</p>
                  <p className="font-medium">{syncService.userEmail}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1 text-sm border border-border rounded-lg hover:bg-bg-secondary"
                >
                  Sign Out
                </button>
              </div>

              {/* Sync Status */}
              <div className="p-4 bg-bg-secondary rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {syncService.status === 'SYNCING' ? (
                      <Loader2 className="w-5 h-5 animate-spin text-accent" />
                    ) : syncService.status === 'OFFLINE' ? (
                      <CloudOff className="w-5 h-5 text-muted-foreground" />
                    ) : syncService.status === 'ERROR' ? (
                      <X className="w-5 h-5 text-red-500" />
                    ) : syncService.isEnabled ? (
                      <Cloud className="w-5 h-5 text-green-500" />
                    ) : (
                      <CloudOff className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span className="font-medium">
                      {statusLabels[syncService.status] ?? syncService.status}
                    </span>
                  </div>
                  {syncService.isEnabled && (
                    <button
                      onClick={handleSyncNow}
                      disabled={syncService.isSyncing || syncService.status === 'SYNCING'}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncService.isSyncing ? 'animate-spin' : ''}`} />
                      立即同步
                    </button>
                  )}
                </div>

                {syncService.lastSyncAt && (
                  <p className="text-xs text-muted-foreground">
                    Last synced: {new Date(syncService.lastSyncAt).toLocaleString()}
                  </p>
                )}
                {syncService.lastError && (
                  <p className="text-xs text-red-500 mt-1">
                    Error: {syncService.lastError}
                  </p>
                )}
                {syncService.vaultName && (
                  <p className="text-sm mt-2">
                    Bound to vault: <span className="font-medium">{syncService.vaultName}</span>
                  </p>
                )}
              </div>

              {/* Unbind vault */}
              {syncService.isEnabled && (
                <div>
                  <button
                    onClick={handleUnbindVault}
                    className="px-3 py-1 text-sm border border-border rounded-lg hover:bg-bg-secondary"
                  >
                    Unbind Vault
                  </button>
                </div>
              )}

              {/* Vault list - only show if not bound */}
              {!syncService.isEnabled && (
                <>
                  <div>
                    <h3 className="text-sm font-medium mb-2">Your Vaults</h3>
                    {syncService.isLoadingVaults ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : syncService.vaults.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No vaults yet</p>
                    ) : (
                      <div className="space-y-2">
                        {syncService.vaults.map((vault) => (
                          <div
                            key={vault.id}
                            className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg"
                          >
                            <div>
                              <p className="font-medium">{vault.name}</p>
                              {vault.description && (
                                <p className="text-xs text-muted-foreground">{vault.description}</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleBindVault(vault.id, vault.name)}
                              className="px-3 py-1 text-sm bg-accent text-white rounded-lg hover:bg-accent/90"
                            >
                              Bind
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Create vault */}
                  <div>
                    <h3 className="text-sm font-medium mb-2">Create New Vault</h3>
                    <form onSubmit={handleCreateVault} className="flex gap-2">
                      <input
                        type="text"
                        value={newVaultName}
                        onChange={(e) => setNewVaultName(e.target.value)}
                        placeholder="Vault name"
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
                      />
                      <button
                        type="submit"
                        disabled={isCreatingVault || !newVaultName.trim()}
                        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
                      >
                        {isCreatingVault ? 'Creating...' : 'Create'}
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === 'templates' && <TemplateSettings />}
    </div>
  );
});
