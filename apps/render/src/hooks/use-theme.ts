import { useService } from '@rabjs/react';
import { UIService, type Theme } from '@/services/ui.service';

export function useTheme() {
  const uiService = useService(UIService);

  return {
    theme: uiService.resolvedTheme,
    themeOption: uiService.theme,
    setTheme: (t: Theme) => uiService.setTheme(t),
  };
}
