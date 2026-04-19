import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './app';
import { register, resolve } from '@rabjs/react';
import { VaultService } from './services/vault.service';
import { UIService } from './services/ui.service';
import { GraphService } from './services/graph.service';
import { SearchService } from './services/search.service';
import { PluginService } from './services/plugin.service';

register(VaultService);
register('UIService', UIService);
register(GraphService);
register(SearchService);
register(PluginService);

// Initialize VaultService to auto-open last vault (awaited to prevent race conditions)
resolve(VaultService).initialize().catch(console.error);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
