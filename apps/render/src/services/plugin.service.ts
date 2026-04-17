import { Service, resolve } from '@rabjs/react';
import type { Plugin } from '../types/plugin';

export class PluginService extends Service {
  plugins: Map<string, Plugin> = new Map();
  enabledPlugins: Set<string> = new Set();
}

export function usePluginService(): PluginService {
  return resolve(PluginService);
}
