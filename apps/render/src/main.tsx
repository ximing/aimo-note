import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Tailwind styles (includes CSS reset)
import './index.css';
// Custom styles
import './styles/index.css';
import { App } from './app';
import { register, resolve } from '@rabjs/react';
import { VaultService } from './services/vault.service';
import { UIService } from './services/ui.service';
import { GraphService } from './services/graph.service';
import { SearchService } from './services/search.service';
import { PluginService } from './services/plugin.service';
import { ImageStorageService } from './services/image-storage.service';
import { TemplateService } from './services/template.service';

// 注册顺序不能乱
register(UIService);
register(VaultService);
register(GraphService);
register(SearchService);
register(PluginService);
register(ImageStorageService);
register(TemplateService);

// Initialize VaultService to auto-open last vault (awaited to prevent race conditions)
resolve(VaultService).initialize().catch(console.error);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
