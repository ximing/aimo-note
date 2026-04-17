import { pluginStore } from '../stores/plugin.store';

export function usePlugins() {
  return pluginStore.use();
}
