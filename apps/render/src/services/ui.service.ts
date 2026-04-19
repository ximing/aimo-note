import { Service, resolve } from '@rabjs/react';
import { VaultService } from './vault.service';

export type Theme = 'light' | 'dark' | 'system';

export class UIService extends Service {
  // Left Rail
  leftRailOpen = true;

  // Explorer
  leftSidebarOpen = true;

  // Title Bar Actions
  titleBarActionsOpen = true;

  // Editor Tabs
  tabs: Array<{ id: string; path: string; title: string }> = [];
  activeTabId: string | null = null;

  // Side Panel
  sidePanelOpen = false;
  sidePanelWidth = 280; // px
  activeSidePanelTab: 'backlinks' | 'outline' | 'tags' = 'backlinks';

  // Settings Modal
  settingsModalOpen = false;

  // Legacy (removed, kept for reference during migration)
  // sidebarOpen = true; // replaced by leftRailOpen and explorerOpen

  // Theme
  theme: Theme = 'system';
  activeModal: string | null = null;
  commandPaletteOpen = false;

  private _systemTheme: 'light' | 'dark' = 'light';
  private _resolvedTheme: 'light' | 'dark' = 'light';
  private _mediaQuery: MediaQueryList | null = null;

  get vaultService() {
    return resolve(VaultService);
  }

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

  // Left Rail
  toggleLeftRail(): void {
    this.leftRailOpen = !this.leftRailOpen;
  }

  // Explorer
  toggleLeftSidebar(): void {
    this.leftSidebarOpen = !this.leftSidebarOpen;
  }

  // Editor Tabs
  openTab(path: string, title: string): void {
    const existing = this.tabs.find(t => t.path === path);
    if (existing) {
      this.activeTabId = existing.id;
    } else {
      const id = `tab-${Date.now()}`;
      this.tabs = [...this.tabs, { id, path, title }];
      this.activeTabId = id;
    }
    this.vaultService.saveTabs(this.tabs, this.activeTabId);
  }

  closeTab(id: string): void {
    const idx = this.tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    this.tabs = this.tabs.filter(t => t.id !== id);
    if (this.activeTabId === id) {
      // Activate adjacent tab
      this.activeTabId = this.tabs[idx - 1]?.id ?? this.tabs[idx]?.id ?? null;
    }
    this.vaultService.saveTabs(this.tabs, this.activeTabId);
  }

  setActiveTab(id: string): void {
    this.activeTabId = id;
    this.vaultService.saveTabs(this.tabs, this.activeTabId);
  }

  restoreTabs(tabs: Array<{ id: string; path: string; title?: string }>, activeTabId: string | null): void {
    this.tabs = tabs.map((tab) => ({
      ...tab,
      title: tab.title ?? tab.path.split('/').pop() ?? 'Untitled',
    }));
    this.activeTabId = activeTabId;
  }

  // Side Panel
  toggleSidePanel(): void {
    this.sidePanelOpen = !this.sidePanelOpen;
  }

  setSidePanelWidth(width: number): void {
    this.sidePanelWidth = Math.max(200, Math.min(600, width));
  }

  dispose() {
    if (this._mediaQuery) {
      this._mediaQuery.removeEventListener('change', this._handleSystemThemeChange);
    }
  }
}

export function useUIService(): UIService {
  return resolve(UIService);
}
