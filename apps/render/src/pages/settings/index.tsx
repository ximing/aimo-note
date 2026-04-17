import { useUIService } from '../../services/ui.service';

export function SettingsPage() {
  const { theme } = useUIService();

  return (
    <div className="settings-page p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section className="settings-section mb-8">
        <h2 className="text-lg font-semibold mb-4">Appearance</h2>
        <div className="flex gap-4">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              className={`px-4 py-2 rounded ${theme === t ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              onClick={() => uiService.setTheme(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section mb-8">
        <h2 className="text-lg font-semibold mb-4">Vault</h2>
        <p className="text-gray-600">Configure vault settings...</p>
      </section>

      <section className="settings-section">
        <h2 className="text-lg font-semibold mb-4">Plugins</h2>
        <p className="text-gray-600">Manage plugins...</p>
      </section>
    </div>
  );
}
