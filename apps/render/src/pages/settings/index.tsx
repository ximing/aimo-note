import { observer } from '@rabjs/react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useUIService } from '../../services/ui.service';
import type { Theme } from '../../services/ui.service';
import { useImageStorageService } from '../../services/image-storage.service';
import type { ImageStorageConfig } from '../../types/image-storage';

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export const SettingsPage = observer(() => {
  const uiService = useUIService();
  const imageStorageService = useImageStorageService();
  const currentTheme = uiService.theme;

  const handleStorageTypeChange = async (type: 'local' | 's3') => {
    try {
      const newConfig: ImageStorageConfig = type === 'local'
        ? { type: 'local', local: { path: 'assets/images' } }
        : { type: 's3', s3: { accessKey: '', secretKey: '', bucket: '', region: 'us-east-1', endpoint: '', keyPrefix: '' } };
      await imageStorageService.saveConfig(newConfig);
    } catch (error) {
      console.error('Failed to save image storage config:', error);
    }
  };

  const handleLocalPathChange = (path: string) => {
    if (imageStorageService.config.type !== 'local') return;
    imageStorageService.saveConfig({ type: 'local', local: { path } });
  };

  const handleS3FieldChange = (field: keyof typeof imageStorageService.config.s3, value: string) => {
    if (imageStorageService.config.type !== 's3') return;
    const currentS3 = { ...imageStorageService.config.s3 };
    imageStorageService.saveConfig({ type: 's3', s3: { ...currentS3, [field]: value } });
  };

  return (
    <div className="settings-page p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6 text-text-primary">Settings</h1>

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
                ${currentTheme === value
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
            <label className="block text-sm font-medium mb-2 text-text-secondary">Local Path</label>
            <input
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
              <label className="block text-sm font-medium mb-2 text-text-secondary" htmlFor="s3-accessKey">Access Key</label>
              <input
                id="s3-accessKey"
                type="text"
                value={imageStorageService.config.s3.accessKey}
                onChange={(e) => handleS3FieldChange('accessKey', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-text-secondary" htmlFor="s3-secretKey">Secret Key</label>
              <input
                id="s3-secretKey"
                type="password"
                value={imageStorageService.config.s3.secretKey}
                onChange={(e) => handleS3FieldChange('secretKey', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-text-secondary" htmlFor="s3-bucket">Bucket</label>
              <input
                id="s3-bucket"
                type="text"
                value={imageStorageService.config.s3.bucket}
                onChange={(e) => handleS3FieldChange('bucket', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-text-secondary" htmlFor="s3-region">Region</label>
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
              <label className="block text-sm font-medium mb-2 text-text-secondary" htmlFor="s3-endpoint">Endpoint (optional)</label>
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
              <label className="block text-sm font-medium mb-2 text-text-secondary" htmlFor="s3-keyPrefix">Key Prefix</label>
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
    </div>
  );
});
