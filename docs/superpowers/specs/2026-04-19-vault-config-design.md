# Vault Config Design — Tab Persistence

## Overview

Store vault-specific configuration (starting with open tabs) inside the vault directory under `.aimo-note/config.json`. This allows tab state to survive app restarts.

## Data Format

**File:** `<vault-path>/.aimo-note/config.json`

```json
{
  "openTabs": [
    { "id": "tab-1713520000000", "path": "notes/hello.md" },
    { "id": "tab-1713520000001", "path": "notes/world.md" }
  ],
  "activeTabId": "tab-1713520000001"
}
```

## File Structure

```
vault/
└── .aimo-note/
    └── config.json
```

The `.aimo-note` directory is created automatically when opening a vault if it doesn't exist.

## IPC Channels

Reuse existing `vault:readNote` and `vault:writeNote` for config I/O.

## Module Changes

### VaultService (`apps/render/src/services/vault.service.ts`)

Add methods:
- `loadTabs(): Promise<TabsConfig | null>` — reads `.aimo-note/config.json`
- `saveTabs(tabs: Tab[], activeTabId: string | null): Promise<void>` — writes `.aimo-note/config.json`

### UIService (`apps/render/src/services/ui.service.ts`)

Tab mutations (open/close/setActive) trigger a debounced save (300ms). Debounce avoids excessive I/O on rapid tab operations.

### VaultTree (`apps/render/src/components/explorer/VaultTree.tsx`)

Filter out nodes where `name === '.aimo-note'` before rendering.

### EditorPage (`apps/render/src/pages/editor/index.tsx`)

After opening a vault, call `VaultService.loadTabs()` and restore tabs via `UIService.restoreTabs()`.

## Save Flow

```
UIService.openTab/closeTab/setActiveTab
  → debounce 300ms
  → VaultService.saveTabs()
  → vault:writeNote(".aimo-note/config.json", content)
```

## Restore Flow

```
VaultService.openVault()
  → vault:readNote(".aimo-note/config.json")
  → UIService.restoreTabs(tabs, activeTabId)
```

## VaultTree Filter

During tree traversal, skip any node whose `name` equals `.aimo-note`. This hides the config directory from the file explorer while keeping it on disk.
