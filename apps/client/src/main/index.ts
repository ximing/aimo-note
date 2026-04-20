import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, globalShortcut, net, protocol } from 'electron';

import { registerIpcHandlers } from './ipc/handlers';
import { createApplicationMenu } from './menu/manager';
import { registerGlobalShortcuts } from './menu/shortcuts';
import { setIsQuiting, setMainWindow } from './shared-state';
import { createTray } from './tray/manager';
import { registerUpdaterEvents, setupAutoUpdater } from './updater';
import { createWindow, showMainWindow } from './window/manager';

registerUpdaterEvents();
registerIpcHandlers();

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'aimo-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

app.on('window-all-closed', () => {
  setMainWindow(null);
  // On macOS, keep app running in background when window is closed
  // On Windows/Linux, we keep running with tray icon
  // Don't quit here - tray icon keeps app running
});

app.on('activate', () => {
  // macOS: click dock icon to restore window
  showMainWindow();
});

app.on('before-quit', () => {
  setIsQuiting(true);
});

// Unregister all shortcuts when app is about to quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.whenReady().then(() => {
  protocol.handle('aimo-image', (request) => {
    try {
      const requestUrl = new URL(request.url);
      const vaultPath = requestUrl.searchParams.get('vaultPath');
      const relativePath = requestUrl.searchParams.get('path');

      if (!vaultPath || !relativePath) {
        return new Response('Missing image path', { status: 400 });
      }

      const sanitizedRelativePath = relativePath.replace(/^([./\\])+/, '');
      const normalizedVaultPath = path.normalize(vaultPath);
      const normalizedFullPath = path.normalize(
        path.join(normalizedVaultPath, sanitizedRelativePath)
      );
      const vaultRootWithSep = normalizedVaultPath.endsWith(path.sep)
        ? normalizedVaultPath
        : `${normalizedVaultPath}${path.sep}`;

      if (
        normalizedFullPath !== normalizedVaultPath &&
        !normalizedFullPath.startsWith(vaultRootWithSep)
      ) {
        return new Response('Forbidden', { status: 403 });
      }

      return net.fetch(pathToFileURL(normalizedFullPath).toString());
    } catch (error) {
      console.error('[Protocol] Failed to resolve image:', error);
      return new Response('Invalid image request', { status: 400 });
    }
  });

  createWindow();
  createTray();
  registerGlobalShortcuts();
  createApplicationMenu();

  // Check for updates 3 seconds after app startup
  setTimeout(() => {
    setupAutoUpdater();
  }, 3000);
});
