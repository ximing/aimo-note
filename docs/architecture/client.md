# Client App (Electron) Architecture

## Overview

The Electron client is the shell application that wraps the React renderer. It handles all native OS integration -- window management, system tray, global shortcuts, auto-updates, secure storage -- while delegating domain logic (vault operations, graph, search, plugins) to `packages/core`. All renderer-main communication flows through typed IPC channels.

## Directory Structure

```
apps/client/src/
├── main/
│   ├── index.ts              # Entry point, app lifecycle
│   ├── constants.ts          # Build-time paths (VITE_DEV_SERVER_URL, PRELOAD_PATH, etc.)
│   ├── shared-state.ts       # Module-level singletons (mainWindow, tray, isQuitting)
│   ├── window/
│   │   ├── manager.ts        # BrowserWindow creation, show/hide, drag-drop
│   │   └── state.ts          # electron-store for window bounds persistence
│   ├── menu/
│   │   ├── manager.ts        # Application menu (macOS/Linux/Windows adaptive)
│   │   └── shortcuts.ts      # Global shortcut registration
│   ├── tray/
│   │   └── manager.ts        # System tray icon and context menu
│   ├── updater/
│   │   └── index.ts          # electron-updater setup and event forwarding
│   └── ipc/
│       └── handlers.ts       # All ipcMain.handle() registrations
├── preload/
│   ├── index.ts              # contextBridge API surface exposed to renderer
│   └── electron.d.ts         # Global Window['electronAPI'] type declaration
```

## Module Responsibilities

### `main/index.ts`

App entry point. Orchestrates initialization in `app.whenReady()`:

1. `registerIpcHandlers()` -- bind all IPC channels
2. `createWindow()` -- build the main BrowserWindow
3. `createTray()` -- system tray icon
4. `registerGlobalShortcuts()` -- global hotkeys
5. `createApplicationMenu()` -- app menu
6. `setupAutoUpdater()` -- check for updates after startup

Handles lifecycle events: `window-all-closed`, `activate`, `before-quit`, `will-quit`.

### `main/shared-state.ts`

Module-level mutable singletons shared across main-process modules. Exists because Electron main modules are effectively singletons -- no constructor injection.

```typescript
// State
mainWindow: BrowserWindow | null;
tray: Tray | null;
isQuitting: boolean;

// Vault service instance (set after vault:open)
vaultService: Vault | null;
```

All other main modules import and mutate these directly. This is a known trade-off in Electron apps -- avoids prop drilling through deeply nested call chains.

### `main/constants.ts`

Build-time constants derived from `import.meta.url`. Centralizes paths so they are computed once.

- `VITE_DEV_SERVER_URL` -- dev server URL (undefined in production)
- `RENDERER_DIST` -- absolute path to renderer dist folder
- `PRELOAD_PATH` -- absolute path to preload script
- `getIconPath()` -- path to app icon

### `main/window/manager.ts`

Owns `createWindow()` and `showMainWindow()`. Responsibilities:

- Creates `BrowserWindow` with appropriate `webPreferences` (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`)
- Validates saved window bounds against available displays before restoring
- Handles drag-and-drop via `webContents` events (`drag-enter`, `drag-over`, `drop`), forwarding file paths to renderer via `files-dropped` IPC
- Prevents file:// navigation from drag operations
- Manages `ready-to-show` → `show()` flow to avoid visual flash
- `close` event → save window state, hide to tray (unless `isQuitting`)

### `main/menu/manager.ts`

Builds the native application menu. Platform-adaptive:

- macOS: full app menu with `about`, `hide`, `quit`; window menu with standard roles
- Windows/Linux: `File` menu with `Quit`; `Help` menu with update check and GitHub link
- All platforms: `Edit`, `View`, `Window` menus with standard accelerator roles

### `main/tray/manager.ts`

System tray icon lifecycle:

- Creates `Tray` with 16px icon
- Sets context menu: "Show Main Window", separator, "Quit"
- Single-click: toggle window visibility
- Tooltip: "AIMO"

### `main/menu/shortcuts.ts`

Global shortcut registration. Currently minimal (stub). Should register:

- `CmdOrCtrl+Shift+A` -- toggle window visibility
- Any user-configurable shortcuts via future settings

### `main/ipc/handlers.ts`

All `ipcMain.handle()` registrations. Delegates to service modules for domain logic.

The current file mixes auth storage, vault stubs, graph stubs, and search stubs. Each domain should eventually get its own handler file under the `ipc/` subdirectory (see Extension Points).

### `main/updater/index.ts`

`electron-updater` integration:

- `setupAutoUpdater()` -- configure and trigger initial update check
- `checkForUpdates()` / `downloadUpdate()` / `installUpdate()` -- user-initiated update actions
- `registerUpdaterEvents()` -- forwards updater events to renderer as `update-status` IPC messages

### `main/window/state.ts`

`electron-store` wrapper for persisting window bounds and maximized state across app restarts.

---

## IPC Channels

All channels use `ipcMain.handle()` / `ipcRenderer.invoke()` (request-response) or `webContents.send()` / `ipcRenderer.on()` (server-push).

### Vault Channels

| Channel        | Direction | Request                             | Response                                        |
| -------------- | --------- | ----------------------------------- | ----------------------------------------------- |
| `vault:open`   | invoke    | `{ vaultPath: string }`             | `Promise<{ success: boolean; error?: string }>` |
| `vault:close`  | invoke    | `void`                              | `Promise<void>`                                 |
| `vault:read`   | invoke    | `{ path: string }`                  | `Promise<Note \| null>`                         |
| `vault:write`  | invoke    | `{ path: string; content: string }` | `Promise<void>`                                 |
| `vault:delete` | invoke    | `{ path: string }`                  | `Promise<void>`                                 |
| `vault:list`   | invoke    | `void`                              | `Promise<string[]>`                             |
| `vault:watch`  | push      | `VaultEvent`                        | (renderer subscribes via `onVaultEvent`)        |

### Graph Channels

| Channel              | Direction | Request            | Response             |
| -------------------- | --------- | ------------------ | -------------------- |
| `graph:build`        | invoke    | `void`             | `Promise<GraphData>` |
| `graph:get`          | invoke    | `{ path: string }` | `Promise<GraphNode>` |
| `graph:getBacklinks` | invoke    | `{ path: string }` | `Promise<string[]>`  |
| `graph:getOutlinks`  | invoke    | `{ path: string }` | `Promise<string[]>`  |

### Search Channels

| Channel          | Direction | Request                             | Response                  |
| ---------------- | --------- | ----------------------------------- | ------------------------- |
| `search:query`   | invoke    | `{ query: string; limit?: number }` | `Promise<SearchResult[]>` |
| `search:reindex` | invoke    | `void`                              | `Promise<void>`           |

### Plugin Channels

| Channel         | Direction | Request            | Response            |
| --------------- | --------- | ------------------ | ------------------- |
| `plugin:load`   | invoke    | `Plugin`           | `Promise<void>`     |
| `plugin:unload` | invoke    | `{ name: string }` | `Promise<void>`     |
| `plugin:list`   | invoke    | `void`             | `Promise<Plugin[]>` |

### Window Channels

| Channel              | Direction | Request | Response           |
| -------------------- | --------- | ------- | ------------------ |
| `window:minimize`    | invoke    | `void`  | `void`             |
| `window:maximize`    | invoke    | `void`  | `void`             |
| `window:close`       | invoke    | `void`  | `void`             |
| `window:isMaximized` | invoke    | `void`  | `Promise<boolean>` |

### FS Channels

| Channel          | Direction | Request      | Response                                            |
| ---------------- | --------- | ------------ | --------------------------------------------------- |
| `fs:selectVault` | invoke    | `void`       | `Promise<string \| null>` (selected directory path) |
| `fs:watch`       | push      | `VaultEvent` | (renderer subscribes via `onVaultEvent`)            |

### App Channels

| Channel               | Direction | Request        | Response                      |
| --------------------- | --------- | -------------- | ----------------------------- |
| `app:getVersion`      | invoke    | `void`         | `Promise<string>`             |
| `app:checkForUpdates` | invoke    | `void`         | `Promise<UpdateInfo \| null>` |
| `app:downloadUpdate`  | invoke    | `void`         | `Promise<void>`               |
| `app:installUpdate`   | invoke    | `void`         | `void`                        |
| `update-status`       | push      | `UpdateStatus` | (renderer subscribes)         |

### Secure Storage Channels

| Channel               | Direction | Request                          | Response                                               |
| --------------------- | --------- | -------------------------------- | ------------------------------------------------------ |
| `secure-store:set`    | invoke    | `{ key: string; value: string }` | `Promise<{ success: boolean; warning?: string }>`      |
| `secure-store:get`    | invoke    | `{ key: string }`                | `Promise<{ success: boolean; value: string \| null }>` |
| `secure-store:delete` | invoke    | `{ key: string }`                | `Promise<{ success: boolean }>`                        |

---

## Integration with Core Package

`packages/core` exposes four domain modules: `Vault`, `Graph`, `SearchIndex`, and the plugin system. The main process imports and instantiates these.

### Vault (packages/core/src/vault)

```typescript
// main process
import { Vault } from '@aimo-note/core';

let vault: Vault | null = null;

ipcMain.handle('vault:open', async (_event, { vaultPath }) => {
  vault = createVault(vaultPath);
  await vault.open(vaultPath);
  return { success: true };
});

ipcMain.handle('vault:read', async (_event, { path }) => {
  return vault ? await vault.readNote(path) : null;
});

// Watch for external file changes
vault?.watch((event) => {
  mainWindow?.webContents.send('vault:watch', event);
});
```

### Graph (packages/core/src/graph)

Built from vault notes on demand or cached:

```typescript
ipcMain.handle('graph:build', async () => {
  const notes = (await vault?.listNotes()) ?? [];
  const noteContents = await Promise.all(notes.map((p) => vault.readNote(p)));
  return graph.buildFromNotes(noteContents);
});
```

### Search (packages/core/src/search)

```typescript
let searchIndex: SearchIndex;

ipcMain.handle('search:query', async (_event, { query, limit }) => {
  return searchIndex.search(query, limit);
});
```

When the vault fires `watch` events, the main process updates the search index accordingly.

### Plugin System (packages/core/src/plugins)

```typescript
import { createPluginSystem } from '@aimo-note/core';

const pluginSystem = createPluginSystem();

ipcMain.handle('plugin:load', async (_event, plugin) => {
  pluginSystem.loadPlugin(plugin);
});

ipcMain.handle('plugin:unload', async (_event, { name }) => {
  pluginSystem.unloadPlugin(name);
});
```

---

## Window Management

### Startup Flow

```
app.whenReady()
  → registerIpcHandlers()
  → createWindow()
    → load saved WindowState from electron-store
    → validate bounds against current displays
    → new BrowserWindow({ ...bounds, webPreferences: { preload } })
    → win.once('ready-to-show') → win.show()
    → win.loadURL(VITE_DEV_SERVER_URL) | win.loadFile(RENDERER_DIST/index.html)
  → createTray()
  → registerGlobalShortcuts()
  → createApplicationMenu()
  → setupAutoUpdater()
```

### Window State Persistence

`WindowState` (x, y, width, height, isMaximized) is saved to `electron-store` on every window close/hide. On startup, bounds are validated against `screen.getAllDisplays()` -- if the saved position is off-screen, default 1200x800 bounds are used.

### Tray Minimization

Closing the window (without `isQuitting = true`) calls `win.hide()` instead of destroying the window. The app keeps running in the system tray. `isQuitting` is set `true` only from the menu "Quit" item or `before-quit` event.

---

## Extension Points

### IPC Handlers Subdirectory

As IPC handlers grow, `ipc/handlers.ts` can be split into multiple files under `ipc/`:

```
ipc/
├── handlers.ts           # Registers all IPC handlers
├── vault-handlers.ts     # vault:* channels
├── graph-handlers.ts     # graph:* channels
├── search-handlers.ts    # search:* channels
├── plugin-handlers.ts    # plugin:* channels
├── window-handlers.ts    # window:* channels
├── fs-handlers.ts        # fs:* channels
└── app-handlers.ts       # app:*, secure-store:* channels
```

`ipc/handlers.ts` then imports and registers all of them in one place.

### Plugin API via IPC

Plugins running in the renderer process need access to the `PluginAPI`. The preload script should expose a `plugin:` namespace on `window.electronAPI` that forwards calls through IPC to the main process, which then calls `pluginSystem`.

```typescript
// preload
contextBridge.exposeInMainWorld('electronAPI', {
  plugin: {
    load: (plugin: Plugin) => ipcRenderer.invoke('plugin:load', plugin),
    unload: (name: string) => ipcRenderer.invoke('plugin:unload', { name }),
    list: () => ipcRenderer.invoke('plugin:list'),
    onEvent: (callback: (event: PluginEvent) => void) => { ... },
  },
});
```

### Settings / Preferences

A future `settings-handlers.ts` can manage user preferences (theme, global shortcuts, update behavior) via `electron-store`, exposed through an IPC namespace.

---

## Testing Strategy

Main process modules are Node.js code, testable with Jest. Key approach:

1. **Unit tests** for pure functions (e.g., window bounds validation, IPC channel name constants, menu template builders)
2. **Integration tests** for handler delegation by mocking `packages/core` services
3. **Window manager tests** spawn a real `BrowserWindow` in a headless environment (Electron Test Runner or `xvfb` on Linux)
4. The preload script can be tested by loading it into a minimal `BrowserWindow` in tests

Mock boundaries:

- Mock `packages/core` modules entirely -- the client tests should not depend on actual vault files
- Mock `electron-store` for store tests
- Use `ipcMain` / `ipcRenderer` directly for IPC tests
