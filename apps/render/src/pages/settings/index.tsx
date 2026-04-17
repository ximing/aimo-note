import { Sun, Moon, Monitor } from 'lucide-react';
import { useUIService } from '../../services/ui.service';
import type { Theme } from '../../services/ui.service';

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function SettingsPage() {
  const uiService = useUIService();
  const currentTheme = uiService.theme;

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
        <h2 className="text-lg font-semibold mb-4 text-text-primary">Vault</h2>
        <p className="text-text-secondary">Configure vault settings...</p>
      </section>

      <section className="settings-section">
        <h2 className="text-lg font-semibold mb-4 text-text-primary">Plugins</h2>
        <p className="text-text-secondary">Manage plugins...</p>
      </section>
    </div>
  );
}
