import { Service } from '@rabjs/react';

export interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  activeModal: string | null;
  commandPaletteOpen: boolean;
}

class UIService extends Service<UIState> {
  protected state: UIState = {
    sidebarOpen: true,
    theme: 'system',
    activeModal: null,
    commandPaletteOpen: false,
  };

  setTheme(theme: 'light' | 'dark' | 'system') {
    this.state.theme = theme;
    this.notify();
  }
}

export const uiService = new UIService();
export function useUIService() {
  return uiService.use();
}
