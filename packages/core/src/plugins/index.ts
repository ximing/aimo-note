export interface Plugin {
  name: string;
  version: string;
  onLoad?: () => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
  hooks?: PluginHooks;
}

export interface PluginHooks {
  onNoteCreate?: (path: string) => void | Promise<void>;
  onNoteUpdate?: (path: string) => void | Promise<void>;
  onNoteDelete?: (path: string) => void | Promise<void>;
  onSearch?: (query: string) => void | Promise<void>;
}

export interface PluginAPI {
  vault: {
    readNote: (path: string) => Promise<unknown>;
    writeNote: (path: string, content: string) => Promise<void>;
  };
}

export function createPluginSystem() {
  const plugins: Plugin[] = [];

  return {
    loadPlugin(plugin: Plugin) {
      plugins.push(plugin);
      plugin.onLoad?.();
    },
    unloadPlugin(name: string) {
      const idx = plugins.findIndex(p => p.name === name);
      if (idx !== -1) {
        plugins[idx].onUnload?.();
        plugins.splice(idx, 1);
      }
    },
    getPlugins() {
      return [...plugins];
    },
  };
}
