import { Service } from '@rabjs/react';
import type { Plugin } from '../types/plugin';

export interface PluginState {
  plugins: Map<string, Plugin>;
  enabledPlugins: Set<string>;
}

class PluginStore extends Service<PluginState> {
  protected state: PluginState = {
    plugins: new Map(),
    enabledPlugins: new Set(),
  };
}

export const pluginStore = new PluginStore();
export function usePluginStore() {
  return pluginStore.use();
}
