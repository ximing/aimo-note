import { Service, resolve } from '@rabjs/react';

export class UIService extends Service {
  sidebarOpen = true;
  theme: 'light' | 'dark' | 'system' = 'system';
  activeModal: string | null = null;
  commandPaletteOpen = false;

  setTheme(theme: 'light' | 'dark' | 'system') {
    this.theme = theme;
  }
}

export function useUIService(): UIService {
  return resolve(UIService);
}
