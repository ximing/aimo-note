# Theme System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Light/Dark theme system with Vue green accent (#42b883), based on UIService + CSS variables + Tailwind.

**Architecture:** Extend existing UIService with resolvedTheme logic, create useTheme hook, connect theme state to DOM via html class toggle, use CSS variables for color values with Tailwind mapping.

**Tech Stack:** Tailwind CSS 3.4, @rabjs/react, React 19

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/render/src/index.css` | Modify | CSS variables for light/dark themes |
| `apps/render/tailwind.config.js` | Modify | Map Tailwind colors to CSS variables |
| `apps/render/src/services/ui.service.ts` | Modify | resolvedTheme, systemTheme, DOM sync |
| `apps/render/src/hooks/use-theme.ts` | Create | useTheme hook for components |
| `apps/render/src/components/Layout.tsx` | Modify | Apply `dark` class to html element |
| `apps/render/src/pages/settings/index.tsx` | Modify | Theme selector with card UI |

---

## Chunk 1: CSS Variables & Tailwind Config

### 1.1 Update index.css

**Files:** Modify: `apps/render/src/index.css`

- [ ] **Step 1: Replace :root styles**

Replace the existing `:root` block with CSS variables:

```css
:root {
  /* Light theme (default) */
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-tertiary: #f1f3f5;
  --text-primary: #1f2937;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;
  --border: #e5e7eb;
  --border-light: #f3f4f6;
  --accent: #42b883;
  --accent-light: #d1fae5;
  --accent-hover: #3a9a6e;
  --shadow: rgba(0, 0, 0, 0.08);
  --shadow-lg: rgba(0, 0, 0, 0.12);

  font-family: Menlo, 'Meslo LG', 'Helvetica Neue', Helvetica, Arial, sans-serif, '微软雅黑', monospace, system-ui, -apple-system, 'Segoe UI', Roboto;
  line-height: 1.5;
  font-weight: 400;
  color-scheme: light;
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 2: Replace html.dark styles**

Replace the existing `html.dark` block:

```css
html.dark {
  color-scheme: dark;
  --bg-primary: #1a1a2e;
  --bg-secondary: #16162a;
  --bg-tertiary: #0f0f1a;
  --text-primary: #e5e7eb;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  --border: #2d2d44;
  --border-light: #252540;
  --accent: #5fc495;
  --accent-light: #1a3a2a;
  --accent-hover: #6dd5a8;
  --shadow: rgba(0, 0, 0, 0.3);
  --shadow-lg: rgba(0, 0, 0, 0.5);
  color: var(--text-primary);
  background-color: var(--bg-secondary);
}
```

- [ ] **Step 3: Update scrollbar colors**

Update scrollbar CSS to use variables:

```css
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
  transition: background 0.3s ease;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

html.dark ::-webkit-scrollbar-thumb {
  background: var(--border);
}

html.dark ::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

html.dark {
  scrollbar-color: var(--border) transparent;
}
```

### 1.2 Update tailwind.config.js

**Files:** Modify: `apps/render/tailwind.config.js`

- [ ] **Step 1: Replace colors section**

Replace the `colors` section in `theme.extend`:

```js
colors: {
  // Vue green palette
  accent: {
    DEFAULT: 'var(--accent)',
    light: 'var(--accent-light)',
    hover: 'var(--accent-hover)',
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#42b883',
    600: '#3a9a6e',
    700: '#2f7a5a',
    800: '#245a46',
    900: '#164332',
  },
  bg: {
    primary: 'var(--bg-primary)',
    secondary: 'var(--bg-secondary)',
    tertiary: 'var(--bg-tertiary)',
  },
  text: {
    primary: 'var(--text-primary)',
    secondary: 'var(--text-secondary)',
    muted: 'var(--text-muted)',
  },
  border: {
    DEFAULT: 'var(--border)',
    light: 'var(--border-light)',
  },
  dark: {
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#eeeeee',
    300: '#e0e0e0',
    400: '#a0a0a0',
    500: '#757575',
    600: '#5a5a5a',
    700: '#424242',
    800: '#2a2a2a',
    900: '#1a1a1a',
    950: '#121212',
  },
},
```

---

## Chunk 2: UIService Enhancement

### 2.1 Update ui.service.ts

**Files:** Modify: `apps/render/src/services/ui.service.ts`

- [ ] **Step 1: Replace UIService implementation**

```typescript
import { Service, resolve } from '@rabjs/react';

export type Theme = 'light' | 'dark' | 'system';

export class UIService extends Service {
  sidebarOpen = true;
  theme: Theme = 'system';
  activeModal: string | null = null;
  commandPaletteOpen = false;

  private _systemTheme: 'light' | 'dark' = 'light';
  private _resolvedTheme: 'light' | 'dark' = 'light';
  private _mediaQuery: MediaQueryList | null = null;

  constructor() {
    super();
    this._initSystemThemeListener();
    this._updateResolvedTheme();
  }

  private _initSystemThemeListener() {
    if (typeof window !== 'undefined') {
      this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this._mediaQuery.addEventListener('change', this._handleSystemThemeChange);
      this._systemTheme = this._mediaQuery.matches ? 'dark' : 'light';
    }
  }

  private _handleSystemThemeChange = (e: MediaQueryListEvent) => {
    this._systemTheme = e.matches ? 'dark' : 'light';
    this._updateResolvedTheme();
  };

  private _updateResolvedTheme() {
    if (this.theme === 'system') {
      this._resolvedTheme = this._systemTheme;
    } else {
      this._resolvedTheme = this.theme;
    }
    this._applyThemeToDOM();
  };

  private _applyThemeToDOM() {
    if (typeof document !== 'undefined') {
      const html = document.documentElement;
      if (this._resolvedTheme === 'dark') {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    }
  }

  get resolvedTheme(): 'light' | 'dark' {
    return this._resolvedTheme;
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    this._updateResolvedTheme();
  }

  override dispose() {
    if (this._mediaQuery) {
      this._mediaQuery.removeEventListener('change', this._handleSystemThemeChange);
    }
    super.dispose();
  }
}

export function useUIService(): UIService {
  return resolve(UIService);
}
```

---

## Chunk 3: useTheme Hook

### 3.1 Create use-theme.ts

**Files:** Create: `apps/render/src/hooks/use-theme.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useService } from '@rabjs/react';
import { UIService, type Theme } from '@/services/ui.service';

export function useTheme() {
  const uiService = useService(UIService);

  return {
    theme: uiService.resolvedTheme,
    themeOption: uiService.theme,
    setTheme: (t: Theme) => uiService.setTheme(t),
  };
}
```

- [ ] **Step 2: Export from hooks index (if exists) or create index**

Check if `apps/render/src/hooks/index.ts` exists:
- If yes, add export
- If no, create the file with export

---

## Chunk 4: Layout & Settings

### 4.1 Update Layout.tsx

**Files:** Modify: `apps/render/src/components/Layout.tsx`

- [ ] **Step 1: Add observer wrapper for theme sync**

The Layout already applies sidebar correctly. Since UIService now handles DOM class in `_applyThemeToDOM()`, Layout doesn't need changes for theme - but we should verify the component is wrapped properly. The existing code is fine since theme sync happens in UIService constructor.

### 4.2 Update SettingsPage

**Files:** Modify: `apps/render/src/pages/settings/index.tsx`

- [ ] **Step 1: Replace SettingsPage with card-style theme selector**

```tsx
import { Sun, Moon, Monitor } from 'lucide-react';
import { useUIService } from '../../services/ui.service';
import type { Theme } from '../../services/ui.service';

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function SettingsPage() {
  const uiService = useUIService();
  const currentTheme = uiService.theme;

  return (
    <div className="settings-page p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6 text-text-primary">Settings</h1>

      <section className="settings-section mb-8">
        <h2 className="text-lg font-semibold mb-4 text-text-primary">Appearance</h2>
        <div className="grid grid-cols-3 gap-4">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => uiService.setTheme(value)}
              className={`
                flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                ${currentTheme === value
                  ? 'border-accent bg-accent-light text-accent'
                  : 'border-border bg-bg-secondary text-text-secondary hover:border-accent/50'
                }
              `}
            >
              <Icon size={24} />
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section mb-8">
        <h2 className="text-lg font-semibold mb-4 text-text-primary">Vault</h2>
        <p className="text-text-secondary">Configure vault settings...</p>
      </section>

      <section className="settings-section">
        <h2 className="text-lg font-semibold mb-4 text-text-primary">Plugins</h2>
        <p className="text-text-secondary">Manage plugins...</p>
      </section>
    </div>
  );
}
```

---

## Chunk 5: Verification

### 5.1 Run dev server and verify

- [ ] **Step 1: Start dev server**

```bash
cd /Users/ximing/project/mygithub/aimo-note && pnpm --filter @aimo-note/render dev
```

- [ ] **Step 2: Verify theme switching**

1. Open http://localhost:5173 (or the port shown)
2. Navigate to Settings
3. Click Light/Dark/System buttons
4. Verify:
   - HTML element gets/loses `dark` class
   - Colors match the CSS variables
   - Transitions are smooth

### 5.2 Test dark mode persistence

- [ ] **Step 1: Select dark theme**
- [ ] **Step 2: Refresh page**
- [ ] **Step 3: Verify dark mode persists (system theme should respect OS setting)

---

## Summary

| Chunk | Tasks | Files |
|-------|-------|-------|
| 1 | CSS variables + Tailwind config | `index.css`, `tailwind.config.js` |
| 2 | UIService enhancement | `ui.service.ts` |
| 3 | useTheme hook | `use-theme.ts` |
| 4 | Settings page UI | `SettingsPage` |
| 5 | Verification | - |
