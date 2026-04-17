import type { Plugin } from '../types/plugin';

export interface Plugin {
  loadPlugin(pluginPath: string): Promise<Plugin>;
  unloadPlugin(pluginId: string): Promise<void>;
  getPluginSettings(pluginId: string): Promise<Record<string, unknown>>;
  setPluginSettings(pluginId: string, settings: Record<string, unknown>): Promise<void>;
}

export const plugin: Plugin = {
  async loadPlugin(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _pluginPath: string) {
    // TODO: IPC call - window.electronAPI.plugin.load(pluginPath)
    throw new Error('Not implemented');
  },
  async unloadPlugin(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _pluginId: string) {
    // TODO: IPC call - window.electronAPI.plugin.unload(pluginId)
  },
  async getPluginSettings(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _pluginId: string) {
    // TODO: IPC call - window.electronAPI.plugin.getSettings(pluginId)
    return {};
  },
  async setPluginSettings(// eslint-disable-next-line @typescript-eslint/no-unused-vars
  _pluginId: string, // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _settings: Record<string, unknown>) {
    // TODO: IPC call - window.electronAPI.plugin.setSettings(pluginId, settings)
  },
};
