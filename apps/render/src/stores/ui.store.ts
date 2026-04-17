import { Service } from '@rabjs/react';

export interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  activeModal: string | null;
  commandPaletteOpen: boolean;
}

class UIStore extends Service<UIState> {
  protected state: UIState = {
    sidebarOpen: true,
    theme: 'system',
    activeModal: null,
    commandPaletteOpen: false,
  };
}

export const uiStore = new UIStore();
export function useUIStore() {
  return uiStore.use();
}
