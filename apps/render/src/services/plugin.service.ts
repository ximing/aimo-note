import { Service } from '@rabjs/react';
import type { Plugin } from '../types/plugin';

export interface PluginState {
  plugins: Map<string, Plugin>;
  enabledPlugins: Set<string>;
}

class PluginService extends Service<PluginState> {
  protected state: PluginState = {
    plugins: new Map(),
    enabledPlugins: new Set(),
  };
}

export const pluginService = new PluginService();
export function usePluginService() {
  return pluginService.use();
}
