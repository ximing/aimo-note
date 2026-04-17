import { Service, resolve } from '@rabjs/react';

export type Theme = 'light' | 'dark' | 'system';

export class UIService extends Service {
  sidebarOpen = true;
  theme: Theme = 'system';
  activeModal: string | null = null;
  commandPaletteOpen = false;

  private _systemTheme: 'light' | 'dark' = 'light';
  private _resolvedTheme: 'light' | 'dark' = 'light';
  private _mediaQuery: MediaQueryList | null = null;

  constructor() {
    super();
    this._initSystemThemeListener();
    this._updateResolvedTheme();
  }

  private _initSystemThemeListener() {
    if (typeof window !== 'undefined') {
      this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this._mediaQuery.addEventListener('change', this._handleSystemThemeChange);
      this._systemTheme = this._mediaQuery.matches ? 'dark' : 'light';
    }
  }

  private _handleSystemThemeChange = (e: MediaQueryListEvent) => {
    this._systemTheme = e.matches ? 'dark' : 'light';
    this._updateResolvedTheme();
  };

  private _updateResolvedTheme() {
    if (this.theme === 'system') {
      this._resolvedTheme = this._systemTheme;
    } else {
      this._resolvedTheme = this.theme;
    }
    this._applyThemeToDOM();
  };

  private _applyThemeToDOM() {
    if (typeof document !== 'undefined') {
      const html = document.documentElement;
      if (this._resolvedTheme === 'dark') {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    }
  }

  get resolvedTheme(): 'light' | 'dark' {
    return this._resolvedTheme;
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    this._updateResolvedTheme();
  }

  override dispose() {
    if (this._mediaQuery) {
      this._mediaQuery.removeEventListener('change', this._handleSystemThemeChange);
    }
    super.dispose();
  }
}

export function useUIService(): UIService {
  return resolve(UIService);
}
