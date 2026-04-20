# Vault Tab Persistence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store open tabs in vault's `.aimo-note/config.json` and restore them on app launch.

**Architecture:** Reuse existing IPC channels (`vault:readNote`/`vault:writeNote`) to read/write config. UIService triggers debounced saves on tab mutations. VaultService loads config on vault open and restores tabs.

**Tech Stack:** React 19, @rabjs/react (Service pattern), Electron IPC, debounce utility.

---

## Chunk 1: VaultService — loadTabs / saveTabs

**Files:**

- Modify: `apps/render/src/services/vault.service.ts`
- Modify: `apps/render/src/ipc/vault.ts` (add `TabConfig` type)

- [ ] **Step 1: Add TabConfig type to IPC vault types**

Add to `apps/render/src/ipc/vault.ts`:

```typescript
export interface TabConfig {
  openTabs: Array<{ id: string; path: string }>;
  activeTabId: string | null;
}
```

- [ ] **Step 2: Add debounce utility import or inline**

Check if debounce exists in project (`packages/logger/` or similar). If not, use lodash.debounce or a simple inline implementation. We'll use lodash if available.

- [ ] **Step 3: Add loadTabs to VaultService**

Add to `VaultService` class:

```typescript
import debounce from 'lodash.debounce';

async loadTabs(): Promise<TabConfig | null> {
  if (!this.path) return null;
  try {
    const result = await window.ipc.vault.readNote(this.path, '.aimo-note/config.json');
    return JSON.parse(result.content) as TabConfig;
  } catch {
    return null; // config doesn't exist yet
  }
}
```

- [ ] **Step 4: Add saveTabs with debounce to VaultService**

Add private debounced save and public method:

```typescript
private debouncedSaveTabs = debounce(async (tabs: Array<{id: string; path: string}>, activeTabId: string | null) => {
  if (!this.path) return;
  const config: TabConfig = { openTabs: tabs, activeTabId };
  await window.ipc.vault.writeNote(this.path, '.aimo-note/config.json', JSON.stringify(config, null, 2));
}, 300);

saveTabs(tabs: Array<{id: string; path: string}>, activeTabId: string | null): void {
  this.debouncedSaveTabs(tabs, activeTabId);
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/render/src/services/vault.service.ts apps/render/src/ipc/vault.ts
git commit -m "feat(vault): add loadTabs and saveTabs to VaultService"
```

---

## Chunk 2: UIService — Trigger saves on tab changes

**Files:**

- Modify: `apps/render/src/services/ui.service.ts`
- Modify: `apps/render/src/services/vault.service.ts` (inject VaultService reference)

- [ ] **Step 1: Add VaultService import and inject it**

In `ui.service.ts`, add:

```typescript
import { vaultService } from './vault.service';
```

- [ ] **Step 2: Update openTab to trigger saveTabs**

Modify `openTab` at the end:

```typescript
openTab(path: string, title: string): void {
  const existing = this.tabs.find(t => t.path === path);
  if (existing) {
    this.activeTabId = existing.id;
  } else {
    const id = `tab-${Date.now()}`;
    this.tabs = [...this.tabs, { id, path, title }];
    this.activeTabId = id;
  }
  vaultService.saveTabs(this.tabs, this.activeTabId);
}
```

- [ ] **Step 3: Update closeTab to trigger saveTabs**

Modify `closeTab` at the end:

```typescript
closeTab(id: string): void {
  const idx = this.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  this.tabs = this.tabs.filter(t => t.id !== id);
  if (this.activeTabId === id) {
    this.activeTabId = this.tabs[idx - 1]?.id ?? this.tabs[idx]?.id ?? null;
  }
  vaultService.saveTabs(this.tabs, this.activeTabId);
}
```

- [ ] **Step 4: Update setActiveTab to trigger saveTabs**

Modify `setActiveTab`:

```typescript
setActiveTab(id: string): void {
  this.activeTabId = id;
  vaultService.saveTabs(this.tabs, this.activeTabId);
}
```

- [ ] **Step 5: Add restoreTabs method to UIService**

```typescript
restoreTabs(tabs: Array<{id: string; path: string}>, activeTabId: string | null): void {
  this.tabs = tabs;
  this.activeTabId = activeTabId;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/render/src/services/ui.service.ts
git commit -m "feat(ui): trigger saveTabs on tab mutations"
```

---

## Chunk 3: EditorPage — Restore tabs on vault open

**Files:**

- Modify: `apps/render/src/pages/editor/index.tsx`

- [ ] **Step 1: Add loadTabs call after vault opens**

Find where `service.openVault()` or `vaultService.openVault()` is called. After it resolves, add:

```typescript
const tabsConfig = await vaultService.loadTabs();
if (tabsConfig && tabsConfig.openTabs.length > 0) {
  uiService.restoreTabs(tabsConfig.openTabs, tabsConfig.activeTabId);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/render/src/pages/editor/index.tsx
git commit -m "feat(editor): restore tabs from vault config on open"
```

---

## Chunk 4: VaultTree — Filter .aimo-note directory

**Files:**

- Modify: `apps/render/src/components/explorer/VaultTree.tsx`

- [ ] **Step 1: Add filter for .aimo-note in sortedTree**

Find where `sortedTree` is computed and add filter:

```typescript
const sortedTree = [...tree]
  .filter((node) => node.name !== '.aimo-note')
  .sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });
```

- [ ] **Step 2: Commit**

```bash
git add apps/render/src/components/explorer/VaultTree.tsx
git commit -m "fix(explorer): filter .aimo-note from vault tree"
```

---

## Verification

After all chunks are complete, run:

```bash
pnpm --filter @aimo-note/render dev
```

Open a vault, create several tabs, close and reopen the app — tabs should persist.
