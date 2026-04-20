import { observer, useService } from '@rabjs/react';
import { X, Sun, Moon, Monitor } from 'lucide-react';
import { UIService } from '@/services/ui.service';
import { useImageStorageService } from '@/services/image-storage.service';
import type { ImageStorageConfig, LocalImageStorageConfig, S3ImageStorageConfig } from '@/types/image-storage';
import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';
type SettingsCategory = 'appearance' | 'editor' | 'shortcuts' | 'image-storage' | 'about';

const settingsCategories: { id: SettingsCategory; label: string }[] = [
  { id: 'appearance', label: '外观' },
  { id: 'editor', label: '编辑器' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'image-storage', label: '图片存储' },
  { id: 'about', label: '关于' },
];

export const SettingsModal = observer(() => {
  const uiService = useService(UIService);

  const handleClose = () => {
    uiService.closeSettings();
  };

  const handleThemeChange = (theme: Theme) => {
    uiService.setTheme(theme);
  };

  const handleCategoryChange = (category: SettingsCategory) => {
    uiService.setActiveSettingsCategory(category);
  };

  const activeCategory = uiService.activeSettingsCategory;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-[800px] h-[600px] bg-bg-primary rounded-md shadow-lg flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 bg-bg-tertiary">
          <div className="p-4 bg-bg-secondary">
            <h2 className="text-sm font-semibold text-text-primary">设置</h2>
          </div>
          <nav className="p-2">
            {settingsCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`w-full px-3 py-2 text-left text-sm rounded cursor-pointer transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-text-secondary hover:bg-bg-tertiary'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between p-4 bg-bg-secondary">
            <h3 className="text-sm font-semibold text-text-primary">
              {settingsCategories.find(c => c.id === activeCategory)?.label}
            </h3>
            <button
              type="button"
              className="p-1 hover:bg-bg-tertiary rounded"
              onClick={handleClose}
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {/* Appearance Section */}
            {activeCategory === 'appearance' && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-text-primary mb-3">主题</h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                      uiService.theme === 'light'
                        ? 'bg-accent text-white'
                        : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary'
                    }`}
                    onClick={() => handleThemeChange('light')}
                  >
                    <Sun size={16} />
                    <span className="text-sm">浅色</span>
                  </button>
                  <button
                    type="button"
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                      uiService.theme === 'dark'
                        ? 'bg-accent text-white'
                        : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary'
                    }`}
                    onClick={() => handleThemeChange('dark')}
                  >
                    <Moon size={16} />
                    <span className="text-sm">深色</span>
                  </button>
                  <button
                    type="button"
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                      uiService.theme === 'system'
                        ? 'bg-accent text-white'
                        : 'bg-bg-secondary hover:bg-bg-tertiary text-text-secondary'
                    }`}
                    onClick={() => handleThemeChange('system')}
                  >
                    <Monitor size={16} />
                    <span className="text-sm">跟随系统</span>
                  </button>
                </div>
              </div>
            )}

            {/* Editor Section */}
            {activeCategory === 'editor' && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-text-primary mb-3">编辑器设置</h4>
                <p className="text-sm text-text-secondary">编辑器设置待实现...</p>
              </div>
            )}

            {/* Shortcuts Section */}
            {activeCategory === 'shortcuts' && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-text-primary mb-3">快捷键设置</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-bg-secondary rounded-md">
                    <span className="text-sm text-text-primary">打开设置</span>
                    <kbd className="px-2 py-1 text-xs bg-bg-tertiary rounded text-text-secondary">
                      {window.electronAPI?.platform === 'darwin' ? '⌘' : 'Ctrl'} + ,
                    </kbd>
                  </div>
                </div>
              </div>
            )}

            {/* About Section */}
            {activeCategory === 'about' && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-text-primary mb-3">关于</h4>
                <div className="text-sm text-text-secondary">
                  <p className="mb-1">AIMO Note v0.9.5</p>
                  <p className="text-text-muted">一个本地优先的笔记应用</p>
                </div>
              </div>
            )}

            {/* Image Storage Section */}
            {activeCategory === 'image-storage' && (
              <ImageStorageSettings />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

const ImageStorageSettings = observer(() => {
  const imageStorageService = useImageStorageService();
  const [config, setConfig] = useState<ImageStorageConfig>(imageStorageService.config);

  useEffect(() => {
    imageStorageService.loadConfig();
  }, []);

  const updateConfig = async (updates: Partial<ImageStorageConfig>) => {
    if (updates.type === 's3') {
      const newConfig: ImageStorageConfig = updates as ImageStorageConfig;
      setConfig(newConfig);
      await imageStorageService.saveConfig(newConfig);
    } else if (updates.type === 'local') {
      const localUpdates = updates.local;
      const currentLocal = config.type === 'local' ? (config as LocalImageStorageConfig).local : null;
      const newConfig: ImageStorageConfig = {
        type: 'local',
        local: { path: localUpdates?.path ?? currentLocal?.path ?? 'assets/images' },
      };
      setConfig(newConfig);
      await imageStorageService.saveConfig(newConfig);
    }
  };

  const updateLocalConfig = async (updates: Partial<LocalImageStorageConfig['local']>) => {
    if (config.type !== 'local') return;
    const currentLocal = (config as LocalImageStorageConfig).local;
    const newConfig: ImageStorageConfig = { type: 'local', local: { ...currentLocal, ...updates } };
    setConfig(newConfig);
    await imageStorageService.saveConfig(newConfig);
  };

  const updateS3Config = async (updates: Partial<S3ImageStorageConfig['s3']>) => {
    if (config.type !== 's3') return;
    const currentS3 = (config as S3ImageStorageConfig).s3;
    const newConfig: ImageStorageConfig = { type: 's3', s3: { ...currentS3, ...updates } };
    setConfig(newConfig);
    await imageStorageService.saveConfig(newConfig);
  };

  return (
    <div className="mb-6">
      <h4 className="text-sm font-medium text-text-primary mb-3">图片存储配置</h4>

      {/* Storage Type Selection */}
      <div className="mb-4">
        <label className="text-sm text-text-secondary mb-2 block">存储类型</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="storageType"
              checked={config.type === 'local'}
              onChange={() => updateConfig({ type: 'local' })}
              className="accent-accent"
            />
            <span className="text-sm text-text-primary">本地存储</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="storageType"
              checked={config.type === 's3'}
              onChange={() => updateConfig({ type: 's3' })}
              className="accent-accent"
            />
            <span className="text-sm text-text-primary">S3 兼容存储</span>
          </label>
        </div>
      </div>

      {/* Local Storage Config */}
      {config.type === 'local' && (
        <div className="bg-bg-secondary px-3 py-2 rounded-md">
          <label className="text-sm text-text-secondary mb-1 block">本地路径</label>
          <input
            type="text"
            value={config.local?.path || 'assets/images'}
            onChange={(e) => updateLocalConfig({ path: e.target.value })}
            className="w-full px-3 py-2 bg-bg-tertiary text-text-primary text-sm rounded border border-transparent focus:border-accent focus:outline-none"
            placeholder="assets/images"
          />
        </div>
      )}

      {/* S3 Storage Config */}
      {config.type === 's3' && (
        <div className="bg-bg-secondary px-3 py-2 rounded-md space-y-3">
          <div>
            <label className="text-sm text-text-secondary mb-1 block">Access Key</label>
            <input
              type="text"
              value={config.s3?.accessKey || ''}
              onChange={(e) => updateS3Config({ accessKey: e.target.value })}
              className="w-full px-3 py-2 bg-bg-tertiary text-text-primary text-sm rounded border border-transparent focus:border-accent focus:outline-none"
              placeholder="AKIAIOSFODNN7EXAMPLE"
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1 block">Secret Key</label>
            <input
              type="password"
              value={config.s3?.secretKey || ''}
              onChange={(e) => updateS3Config({ secretKey: e.target.value })}
              className="w-full px-3 py-2 bg-bg-tertiary text-text-primary text-sm rounded border border-transparent focus:border-accent focus:outline-none"
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1 block">Bucket</label>
            <input
              type="text"
              value={config.s3?.bucket || ''}
              onChange={(e) => updateS3Config({ bucket: e.target.value })}
              className="w-full px-3 py-2 bg-bg-tertiary text-text-primary text-sm rounded border border-transparent focus:border-accent focus:outline-none"
              placeholder="my-image-bucket"
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1 block">Region</label>
            <input
              type="text"
              value={config.s3?.region || ''}
              onChange={(e) => updateS3Config({ region: e.target.value })}
              className="w-full px-3 py-2 bg-bg-tertiary text-text-primary text-sm rounded border border-transparent focus:border-accent focus:outline-none"
              placeholder="us-east-1"
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1 block">Endpoint (可选)</label>
            <input
              type="text"
              value={config.s3?.endpoint || ''}
              onChange={(e) => updateS3Config({ endpoint: e.target.value })}
              className="w-full px-3 py-2 bg-bg-tertiary text-text-primary text-sm rounded border border-transparent focus:border-accent focus:outline-none"
              placeholder="https://s3.amazonaws.com"
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary mb-1 block">Key Prefix (可选)</label>
            <input
              type="text"
              value={config.s3?.keyPrefix || ''}
              onChange={(e) => updateS3Config({ keyPrefix: e.target.value })}
              className="w-full px-3 py-2 bg-bg-tertiary text-text-primary text-sm rounded border border-transparent focus:border-accent focus:outline-none"
              placeholder="images/"
            />
          </div>
        </div>
      )}
    </div>
  );
});
