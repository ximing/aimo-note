# Note Template System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support directory-to-template mapping with recursive lookup. Templates stored as .md files in `.aimo-note/templates/`. New notes apply template content (frontmatter + body with variable substitution).

**Architecture:** Template files stored in vault as `.md` files with frontmatter. Mapping stored in `.aimo-note/config.json`. Template lookup traverses parent directories upward until root.

**Tech Stack:** Electron IPC, React 19, RSJS Service, Milkdown v7

---

## File Structure

```
packages/dto/src/template.ts           [NEW] Template types
packages/core/src/vault/template.ts     [NEW] Template core logic
apps/client/src/main/ipc/handlers.ts    [MODIFY] Add template IPC handlers
apps/client/src/preload/index.ts        [MODIFY] Expose template IPC
apps/render/src/ipc/template.ts         [NEW] Renderer IPC wrapper
apps/render/src/services/              [NEW] TemplateService
apps/render/src/pages/settings/        [MODIFY] Add Templates tab
apps/render/src/components/template/   [NEW] TemplateEditor component
apps/render/src/components/common/     [MODIFY] NewNoteDialog with template form
apps/render/src/services/vault.service.ts [MODIFY] createNote with template
```

---

## Chunk 1: DTO Types

**Files:**

- Create: `packages/dto/src/template.ts`

### Task 1: Define template types

- [ ] **Step 1: Create template types**

```typescript
// packages/dto/src/template.ts

export type TemplateFieldType = 'text' | 'date' | 'tags' | 'checkbox';

export interface TemplateField {
  name: string;
  type: TemplateFieldType;
  defaultValue?: unknown;
  autoSet?: 'created' | 'modified';
}

export interface Template {
  fileName: string;
  fields: TemplateField[];
  body: string;
}

export interface TemplateMapping {
  directory: string;
  templateFileName: string;
}

export interface TemplateListItem {
  fileName: string;
  fieldCount: number;
  preview: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dto/src/template.ts
git commit -m "feat(dto): add template types"
```

---

## Chunk 2: Core Template Logic

**Files:**

- Create: `packages/core/src/vault/template.ts`
- Modify: `packages/core/src/vault/index.ts`

### Task 2: Implement template core logic

- [ ] **Step 1: Create template.ts**

```typescript
// packages/core/src/vault/template.ts

import matter from 'gray-matter';
import type { Template, TemplateField, TemplateFieldType } from '@aimo-note/dto';

const TEMPLATES_DIR = '.aimo-note/templates';
const TEMPLATE_EXT = '.md';

export interface ParsedTemplate {
  fields: TemplateField[];
  body: string;
}

export interface TemplateApplyResult {
  content: string;
  frontmatter: Record<string, unknown>;
}

/**
 * Parse a template file content into structured Template.
 */
export function parseTemplate(content: string, fileName: string): Template {
  const { data, content: body } = matter(content);
  const fields: TemplateField[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'title' || key === 'tags' || key === 'created' || key === 'modified') {
      continue; // skip reserved fields
    }
    if (typeof value === 'boolean' && (key === 'created' || key === 'modified')) {
      fields.push({ name: key, type: 'checkbox', autoSet: key });
    } else if (typeof value === 'string') {
      fields.push({ name: key, type: 'text', defaultValue: value });
    } else if (Array.isArray(value)) {
      fields.push({ name: key, type: 'tags', defaultValue: value });
    } else {
      fields.push({ name: key, type: 'text', defaultValue: String(value) });
    }
  }

  return { fileName, fields, body };
}

/**
 * Detect field type from raw YAML value string.
 */
export function detectFieldType(valueStr: string): TemplateFieldType {
  if (valueStr === 'true' || valueStr === 'false') return 'checkbox';
  if (valueStr === '[]') return 'tags';
  if (/^\d{4}-\d{2}-\d{2}/.test(valueStr)) return 'date';
  return 'text';
}

/**
 * Build frontmatter string from field values.
 */
export function buildFrontmatter(
  fields: TemplateField[],
  values: Record<string, unknown>,
  fileName: string
): Record<string, unknown> {
  const fm: Record<string, unknown> = {};

  // Add title from filename
  fm.title = fileName.replace(/\.md$/, '');

  // Process each field
  for (const field of fields) {
    if (field.autoSet === 'created') {
      fm.created = new Date().toISOString();
    } else if (field.autoSet === 'modified') {
      fm.modified = new Date().toISOString();
    } else {
      fm[field.name] = values[field.name] ?? field.defaultValue ?? '';
    }
  }

  // Always include title, tags, created, modified
  if (!fields.some((f) => f.name === 'created')) {
    fm.created = new Date().toISOString();
  }
  if (!fields.some((f) => f.name === 'modified')) {
    fm.modified = new Date().toISOString();
  }
  if (!fields.some((f) => f.name === 'tags')) {
    fm.tags = [];
  }

  return fm;
}

/**
 * Substitute {{variable}} placeholders in template body.
 */
export function substituteVariables(
  body: string,
  values: Record<string, unknown>,
  fileName: string
): string {
  let result = body;
  result = result.replace(/\{\{title\}\}/g, fileName.replace(/\.md$/, ''));
  result = result.replace(/\{\{date\}\}/g, new Date().toISOString().split('T')[0]);

  for (const [key, value] of Object.entries(values)) {
    const placeholder = `{{${key}}}`;
    const replacement = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), replacement);
  }

  return result;
}

/**
 * Apply template to create note content.
 */
export function applyTemplate(
  template: Template,
  values: Record<string, unknown>,
  fileName: string
): TemplateApplyResult {
  const frontmatter = buildFrontmatter(template.fields, values, fileName);
  const body = substituteVariables(template.body, values, fileName);

  const fmLines = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${JSON.stringify(v)}`;
      if (typeof v === 'string') return `${k}: "${v}"`;
      return `${k}: ${v}`;
    })
    .join('\n');

  return {
    content: `---\n${fmLines}\n---\n\n${body}`,
    frontmatter,
  };
}

/**
 * Build template file content from Template object.
 */
export function serializeTemplate(template: Template): string {
  const fmLines: string[] = [];

  for (const field of template.fields) {
    if (field.autoSet === 'created') {
      fmLines.push('created: true');
    } else if (field.autoSet === 'modified') {
      fmLines.push('modified: true');
    } else if (field.type === 'tags') {
      fmLines.push(`${field.name}: []`);
    } else {
      fmLines.push(`${field.name}: "${field.defaultValue ?? ''}"`);
    }
  }

  return `---\n${fmLines.join('\n')}\n---\n\n${template.body}`;
}

/**
 * Find template for a given directory by traversing parent directories.
 * Returns template file name or null if not found.
 */
export function findTemplateForDirectory(
  mappings: Record<string, string>,
  directory: string
): string | null {
  let current = directory;

  while (true) {
    const templateName = mappings[current];
    if (templateName) return templateName;

    if (current === '') break; // reached root

    const lastSlash = current.lastIndexOf('/');
    current = lastSlash === -1 ? '' : current.substring(0, lastSlash);
  }

  // Fall back to root mapping
  return mappings[''] ?? null;
}
```

- [ ] **Step 2: Update vault/index.ts to export template functions**

```typescript
// Add to packages/core/src/vault/index.ts
export * from './template.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/vault/template.ts packages/core/src/vault/index.ts
git commit -m "feat(core): add template core logic"
```

---

## Chunk 3: IPC Layer (Client + Preload)

**Files:**

- Modify: `apps/client/src/main/ipc/handlers.ts`
- Modify: `apps/client/src/preload/index.ts`

### Task 3: Add template IPC handlers in main process

- [ ] **Step 1: Add handlers to handlers.ts**

Locate the end of `registerIpcHandlers()` in `apps/client/src/main/ipc/handlers.ts`, before the closing `console.log`. Add:

```typescript
// Template handlers
ipcMain.handle('template:list', async (_event, vaultPath: string) => {
  try {
    const templatesDir = path.join(vaultPath, TEMPLATES_DIR);
    const entries = await fs.readdir(templatesDir).catch(() => []);
    const templateFiles = entries.filter((f: string) => f.endsWith(TEMPLATE_EXT));

    const templates: Array<{ fileName: string; fieldCount: number; preview: string }> = [];
    for (const file of templateFiles) {
      const fullPath = path.join(templatesDir, file);
      const content = await fs.readFile(fullPath, 'utf-8');
      const { data, content: body } = matter(content);
      const fieldCount = Object.keys(data).length;
      const preview = body.split('\n').slice(0, 2).join(' ').substring(0, 50);
      templates.push({ fileName: file, fieldCount, preview });
    }

    return { success: true, templates };
  } catch (error) {
    return { success: false, error: String(error), templates: [] };
  }
});

ipcMain.handle('template:read', async (_event, vaultPath: string, fileName: string) => {
  try {
    const fullPath = path.join(vaultPath, TEMPLATES_DIR, fileName);
    const content = await fs.readFile(fullPath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle(
  'template:write',
  async (_event, vaultPath: string, fileName: string, content: string) => {
    try {
      const templatesDir = path.join(vaultPath, TEMPLATES_DIR);
      await fs.mkdir(templatesDir, { recursive: true });
      const fullPath = path.join(templatesDir, fileName);
      await fs.writeFile(fullPath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
);

ipcMain.handle('template:delete', async (_event, vaultPath: string, fileName: string) => {
  try {
    const fullPath = path.join(vaultPath, TEMPLATES_DIR, fileName);
    await fs.rm(fullPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('template:getMappings', async (_event, vaultPath: string) => {
  try {
    const configPath = path.join(vaultPath, '.aimo-note/config.json');
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    return { success: true, mappings: config.templateMappings ?? {} };
  } catch {
    return { success: true, mappings: {} };
  }
});

ipcMain.handle(
  'template:setMappings',
  async (_event, vaultPath: string, mappings: Record<string, string>) => {
    try {
      const configPath = path.join(vaultPath, '.aimo-note/config.json');
      let existingConfig: Record<string, unknown> = {};
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        existingConfig = JSON.parse(content);
      } catch {
        /* ignore */
      }
      existingConfig.templateMappings = mappings;
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
);
```

Note: Add `import matter from 'gray-matter';` at the top of handlers.ts if not present, and add `const TEMPLATES_DIR = '.aimo-note/templates'; const TEMPLATE_EXT = '.md';` as module-level constants.

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/main/ipc/handlers.ts
git commit -m "feat(client): add template IPC handlers"
```

### Task 4: Expose template IPC in preload

- [ ] **Step 1: Add to preload/index.ts**

In `apps/client/src/preload/index.ts`, add to the `vault:` section in `contextBridge.exposeInMainWorld('electronAPI', {` and to the `declare global` type definition:

```typescript
  // Template operations
  template: {
    list: (vaultPath: string) =>
      ipcRenderer.invoke('template:list', vaultPath) as Promise<{
        success: boolean;
        templates: Array<{ fileName: string; fieldCount: number; preview: string }>;
        error?: string;
      }>,
    read: (vaultPath: string, fileName: string) =>
      ipcRenderer.invoke('template:read', vaultPath, fileName) as Promise<{
        success: boolean;
        content?: string;
        error?: string;
      }>,
    write: (vaultPath: string, fileName: string, content: string) =>
      ipcRenderer.invoke('template:write', vaultPath, fileName, content) as Promise<{
        success: boolean;
        error?: string;
      }>,
    delete: (vaultPath: string, fileName: string) =>
      ipcRenderer.invoke('template:delete', vaultPath, fileName) as Promise<{
        success: boolean;
        error?: string;
      }>,
    getMappings: (vaultPath: string) =>
      ipcRenderer.invoke('template:getMappings', vaultPath) as Promise<{
        success: boolean;
        mappings: Record<string, string>;
        error?: string;
      }>,
    setMappings: (vaultPath: string, mappings: Record<string, string>) =>
      ipcRenderer.invoke('template:setMappings', vaultPath, mappings) as Promise<{
        success: boolean;
        error?: string;
      }>,
  },
```

And in `declare global interface Window { electronAPI: { ... } }`, add the same shape to the type declaration.

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/preload/index.ts
git commit -m "feat(preload): expose template IPC channels"
```

---

## Chunk 4: Renderer IPC Wrapper

**Files:**

- Create: `apps/render/src/ipc/template.ts`

### Task 5: Create renderer IPC wrapper

- [ ] **Step 1: Create apps/render/src/ipc/template.ts**

```typescript
// apps/render/src/ipc/template.ts

export interface TemplateListItem {
  fileName: string;
  fieldCount: number;
  preview: string;
}

export interface TemplateIPC {
  list(vaultPath: string): Promise<{
    success: boolean;
    templates: TemplateListItem[];
    error?: string;
  }>;
  read(
    vaultPath: string,
    fileName: string
  ): Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }>;
  write(
    vaultPath: string,
    fileName: string,
    content: string
  ): Promise<{
    success: boolean;
    error?: string;
  }>;
  delete(
    vaultPath: string,
    fileName: string
  ): Promise<{
    success: boolean;
    error?: string;
  }>;
  getMappings(vaultPath: string): Promise<{
    success: boolean;
    mappings: Record<string, string>;
    error?: string;
  }>;
  setMappings(
    vaultPath: string,
    mappings: Record<string, string>
  ): Promise<{
    success: boolean;
    error?: string;
  }>;
}

export const template: TemplateIPC = {
  async list(vaultPath: string) {
    const result = await window.electronAPI!.template.list(vaultPath);
    if (!result.success) throw new Error(result.error);
    return result;
  },
  async read(vaultPath: string, fileName: string) {
    const result = await window.electronAPI!.template.read(vaultPath, fileName);
    if (!result.success) throw new Error(result.error);
    return result;
  },
  async write(vaultPath: string, fileName: string, content: string) {
    const result = await window.electronAPI!.template.write(vaultPath, fileName, content);
    if (!result.success) throw new Error(result.error);
    return result;
  },
  async delete(vaultPath: string, fileName: string) {
    const result = await window.electronAPI!.template.delete(vaultPath, fileName);
    if (!result.success) throw new Error(result.error);
    return result;
  },
  async getMappings(vaultPath: string) {
    const result = await window.electronAPI!.template.getMappings(vaultPath);
    return result;
  },
  async setMappings(vaultPath: string, mappings: Record<string, string>) {
    const result = await window.electronAPI!.template.setMappings(vaultPath, mappings);
    if (!result.success) throw new Error(result.error);
    return result;
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/render/src/ipc/template.ts
git commit -m "feat(render): add template IPC wrapper"
```

---

## Chunk 5: TemplateService

**Files:**

- Create: `apps/render/src/services/template.service.ts`

### Task 6: Create TemplateService

- [ ] **Step 1: Create apps/render/src/services/template.service.ts**

```typescript
// apps/render/src/services/template.service.ts

import { Service } from '@rabjs/react';
import { template } from '@/ipc/template';
import { VaultService } from './vault.service';
import type { Template, TemplateField, TemplateMapping } from '@aimo-note/dto';
import {
  parseTemplate,
  applyTemplate,
  serializeTemplate,
  findTemplateForDirectory,
} from '@aimo-note/core';

export class TemplateService extends Service {
  templates: Array<{ fileName: string; fieldCount: number; preview: string }> = [];
  mappings: Record<string, string> = {};
  isLoading = false;

  private get vaultService(): VaultService {
    return this.resolve(VaultService);
  }

  private get vaultPath(): string | null {
    return this.vaultService.path;
  }

  async loadTemplates(): Promise<void> {
    if (!this.vaultPath) return;
    this.isLoading = true;
    try {
      const result = await template.list(this.vaultPath);
      this.templates = result.templates;
      const mappingsResult = await template.getMappings(this.vaultPath);
      this.mappings = mappingsResult.mappings;
    } finally {
      this.isLoading = false;
    }
  }

  async readTemplate(fileName: string): Promise<Template> {
    if (!this.vaultPath) throw new Error('No vault open');
    const result = await template.read(this.vaultPath, fileName);
    return parseTemplate(result.content!, fileName);
  }

  async saveTemplate(templateObj: Template): Promise<void> {
    if (!this.vaultPath) throw new Error('No vault open');
    const content = serializeTemplate(templateObj);
    await template.write(this.vaultPath, templateObj.fileName, content);
    await this.loadTemplates();
  }

  async deleteTemplate(fileName: string): Promise<void> {
    if (!this.vaultPath) throw new Error('No vault open');
    await template.delete(this.vaultPath, fileName);
    await this.loadTemplates();
  }

  async setMapping(directory: string, templateFileName: string): Promise<void> {
    if (!this.vaultPath) throw new Error('No vault open');
    const newMappings = { ...this.mappings, [directory]: templateFileName };
    await template.setMappings(this.vaultPath, newMappings);
    this.mappings = newMappings;
  }

  async removeMapping(directory: string): Promise<void> {
    if (!this.vaultPath) throw new Error('No vault open');
    const newMappings = { ...this.mappings };
    delete newMappings[directory];
    await template.setMappings(this.vaultPath, newMappings);
    this.mappings = newMappings;
  }

  async findTemplateForDirectory(directory: string): Promise<Template | null> {
    const templateFileName = findTemplateForDirectory(this.mappings, directory);
    if (!templateFileName) return null;
    try {
      return await this.readTemplate(templateFileName);
    } catch {
      return null;
    }
  }

  applyTemplateToContent(
    templateObj: Template,
    values: Record<string, unknown>,
    fileName: string
  ): string {
    return applyTemplate(templateObj, values, fileName).content;
  }
}
```

- [ ] **Step 2: Register TemplateService in main.tsx**

Locate `apps/render/src/main.tsx` and add `TemplateService` import and registration after other services.

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/services/template.service.ts apps/render/src/main.tsx
git commit -m "feat(render): add TemplateService"
```

---

## Chunk 6: TemplateEditor Component

**Files:**

- Create: `apps/render/src/components/template/TemplateEditor.tsx`

### Task 7: Create TemplateEditor component

- [ ] **Step 1: Create apps/render/src/components/template/TemplateEditor.tsx**

```typescript
// apps/render/src/components/template/TemplateEditor.tsx

import { useState, useCallback } from 'react';
import { observer } from '@rabjs/react';
import type { Template, TemplateField, TemplateFieldType } from '@aimo-note/dto';
import { serializeTemplate } from '@aimo-note/core';

interface TemplateEditorProps {
  template?: Template;
  onSave: (template: Template) => void;
  onCancel: () => void;
}

const FIELD_TYPES: { value: TemplateFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'tags', label: 'Tags' },
  { value: 'checkbox', label: 'Checkbox' },
];

export const TemplateEditor = observer(({ template, onSave, onCancel }: TemplateEditorProps) => {
  const [fileName, setFileName] = useState(template?.fileName ?? '');
  const [fields, setFields] = useState<TemplateField[]>(
    template?.fields ?? [
      { name: 'title', type: 'text' },
      { name: 'tags', type: 'tags' },
      { name: 'created', type: 'checkbox', autoSet: 'created' },
      { name: 'modified', type: 'checkbox', autoSet: 'modified' },
    ]
  );
  const [body, setBody] = useState(template?.body ?? '# {{title}}\n\n');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<TemplateFieldType>('text');

  const handleAddField = useCallback(() => {
    if (!newFieldName.trim()) return;
    if (fields.some(f => f.name === newFieldName.trim())) return;
    setFields([...fields, { name: newFieldName.trim(), type: newFieldType }]);
    setNewFieldName('');
  }, [newFieldName, newFieldType, fields]);

  const handleRemoveField = useCallback((name: string) => {
    setFields(fields.filter(f => f.name !== name));
  }, [fields]);

  const handleSave = useCallback(() => {
    const cleanFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    const templateObj: Template = {
      fileName: cleanFileName,
      fields,
      body,
    };
    onSave(templateObj);
  }, [fileName, fields, body, onSave]);

  return (
    <div className="template-editor p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4">
        {template ? `Edit: ${template.fileName}` : 'New Template'}
      </h2>

      {/* File Name */}
      {!template && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Template Name</label>
          <input
            type="text"
            value={fileName}
            onChange={e => setFileName(e.target.value)}
            placeholder="my-template"
            className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
          />
        </div>
      )}

      {/* Frontmatter Fields */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Frontmatter Fields</h3>
        <div className="space-y-2">
          {fields.map(field => (
            <div key={field.name} className="flex items-center gap-2 p-2 bg-bg-secondary rounded">
              <span className="font-mono text-sm flex-1">{field.name}</span>
              <span className="text-xs text-muted-foreground px-2 py-0.5 bg-bg-tertiary rounded">
                {field.type}
              </span>
              {field.autoSet && (
                <span className="text-xs text-accent px-2 py-0.5 bg-accent/10 rounded">
                  auto:{field.autoSet}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleRemoveField(field.name)}
                className="text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Add Field */}
        <div className="mt-3 flex gap-2 items-end">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Field Name</label>
            <input
              type="text"
              value={newFieldName}
              onChange={e => setNewFieldName(e.target.value)}
              placeholder="custom_field"
              className="px-3 py-2 rounded border border-border bg-bg-secondary text-text-primary text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Type</label>
            <select
              value={newFieldType}
              onChange={e => setNewFieldType(e.target.value as TemplateFieldType)}
              className="px-3 py-2 rounded border border-border bg-bg-secondary text-text-primary text-sm"
            >
              {FIELD_TYPES.map(ft => (
                <option key={ft.value} value={ft.value}>{ft.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleAddField}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Add
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Body</h3>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary font-mono text-sm"
          placeholder="Use {{fieldName}} for variable substitution..."
        />
        <p className="text-xs text-muted-foreground mt-1">
          Use {'{{fieldName}}'} for variable substitution. Available: {'{{title}}'}, {'{{date}}'}.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!fileName.trim()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          Save Template
        </button>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/render/src/components/template/TemplateEditor.tsx
git commit -m "feat(render): add TemplateEditor component"
```

---

## Chunk 7: Settings Page Templates Tab

**Files:**

- Modify: `apps/render/src/pages/settings/index.tsx` (add Templates tab)
- Create: `apps/render/src/pages/settings/components/TemplateSettings.tsx`

### Task 8: Add Templates tab to Settings page

- [ ] **Step 1: Create apps/render/src/pages/settings/components/TemplateSettings.tsx**

```typescript
// apps/render/src/pages/settings/components/TemplateSettings.tsx

import { useState, useCallback, useEffect } from 'react';
import { observer, useService } from '@rabjs/react';
import { TemplateService } from '@/services/template.service';
import { TemplateEditor } from '@/components/template/TemplateEditor';
import type { Template } from '@aimo-note/dto';

export const TemplateSettings = observer(() => {
  const templateService = useService(TemplateService);
  const [editingTemplate, setEditingTemplate] = useState<Template | null | undefined>(undefined);
    // null = new template, undefined = not editing
  const [activeTab, setActiveTab] = useState<'list' | 'mappings'>('list');

  useEffect(() => {
    templateService.loadTemplates();
  }, [templateService]);

  const handleNewTemplate = useCallback(() => {
    setEditingTemplate(null);
  }, []);

  const handleEditTemplate = useCallback(async (fileName: string) => {
    const t = await templateService.readTemplate(fileName);
    setEditingTemplate(t);
  }, [templateService]);

  const handleSaveTemplate = useCallback(async (t: Template) => {
    await templateService.saveTemplate(t);
    setEditingTemplate(undefined);
  }, [templateService]);

  const handleDeleteTemplate = useCallback(async (fileName: string) => {
    await templateService.deleteTemplate(fileName);
  }, [templateService]);

  if (editingTemplate !== undefined) {
    return (
      <TemplateEditor
        template={editingTemplate ?? undefined}
        onSave={handleSaveTemplate}
        onCancel={() => setEditingTemplate(undefined)}
      />
    );
  }

  return (
    <div className="template-settings">
      {/* Tab Switcher */}
      <div className="flex gap-4 mb-6 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={`pb-2 px-1 font-medium ${
            activeTab === 'list'
              ? 'border-b-2 border-accent text-accent'
              : 'text-muted-foreground hover:text-text-primary'
          }`}
        >
          Template List
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mappings')}
          className={`pb-2 px-1 font-medium ${
            activeTab === 'mappings'
              ? 'border-b-2 border-accent text-accent'
              : 'text-muted-foreground hover:text-text-primary'
          }`}
        >
          Directory Mappings
        </button>
      </div>

      {activeTab === 'list' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Templates</h3>
            <button
              type="button"
              onClick={handleNewTemplate}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              + New Template
            </button>
          </div>

          {templateService.templates.length === 0 ? (
            <p className="text-muted-foreground text-sm">No templates yet. Create one to get started.</p>
          ) : (
            <div className="space-y-2">
              {templateService.templates.map(t => (
                <div
                  key={t.fileName}
                  className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg"
                >
                  <div>
                    <p className="font-medium">{t.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.fieldCount} fields · {t.preview}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditTemplate(t.fileName)}
                      className="px-3 py-1 text-sm border border-border rounded hover:bg-muted"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(t.fileName)}
                      className="px-3 py-1 text-sm text-destructive border border-border rounded hover:bg-destructive/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mappings' && (
        <DirectoryMappings />
      )}
    </div>
  );
});

const DirectoryMappings = observer(() => {
  const templateService = useService(TemplateService);
  const [newDir, setNewDir] = useState('');
  const [newTemplate, setNewTemplate] = useState('');

  const handleAddMapping = useCallback(async () => {
    if (!newDir.trim() || !newTemplate) return;
    await templateService.setMapping(newDir.trim(), newTemplate);
    setNewDir('');
    setNewTemplate('');
  }, [newDir, newTemplate, templateService]);

  const handleRemoveMapping = useCallback(async (dir: string) => {
    await templateService.removeMapping(dir);
  }, [templateService]);

  const entries = Object.entries(templateService.mappings);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Directory → Template Mappings</h3>

      {entries.length > 0 && (
        <div className="space-y-2 mb-6">
          {entries.map(([dir, tmpl]) => (
            <div key={dir} className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg">
              <span className="font-mono text-sm flex-1">{dir || '(root)'}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono text-sm">{tmpl}</span>
              <button
                type="button"
                onClick={() => handleRemoveMapping(dir)}
                className="text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Directory</label>
          <input
            type="text"
            value={newDir}
            onChange={e => setNewDir(e.target.value)}
            placeholder="e.g. journals (empty for root)"
            className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Template</label>
          <select
            value={newTemplate}
            onChange={e => setNewTemplate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
          >
            <option value="">Select template...</option>
            {templateService.templates.map(t => (
              <option key={t.fileName} value={t.fileName}>{t.fileName}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleAddMapping}
          disabled={!newDir.trim() || !newTemplate}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Integrate into Settings page**

In `apps/render/src/pages/settings/index.tsx`, add a "Templates" tab alongside "Appearance" and "Image Storage". Import `TemplateSettings` and conditionally render it.

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/pages/settings/components/TemplateSettings.tsx apps/render/src/pages/settings/index.tsx
git commit -m "feat(render): add Templates tab to Settings page"
```

---

## Chunk 8: New Note Dialog with Template Variables

**Files:**

- Create: `apps/render/src/components/common/NewNoteDialog.tsx`
- Modify: `apps/render/src/components/explorer/VaultTree.tsx`
- Modify: `apps/render/src/services/vault.service.ts`

### Task 9: Create NewNoteDialog with template variable collection

- [ ] **Step 1: Create apps/render/src/components/common/NewNoteDialog.tsx**

```typescript
// apps/render/src/components/common/NewNoteDialog.tsx

import { useState, useCallback, useEffect } from 'react';
import { observer, useService } from '@rabjs/react';
import { PromptDialog } from './PromptDialog';
import { TemplateService } from '@/services/template.service';
import type { Template, TemplateField } from '@aimo-note/dto';

interface NewNoteDialogProps {
  parentPath: string;
  onConfirm: (name: string, content: string) => void;
  onCancel: () => void;
}

export const NewNoteDialog = observer(({ parentPath, onConfirm, onCancel }: NewNoteDialogProps) => {
  const templateService = useService(TemplateService);
  const [step, setStep] = useState<'name' | 'variables'>('name');
  const [noteName, setNoteName] = useState('');
  const [template, setTemplate] = useState<Template | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    templateService.loadTemplates();
  }, [templateService]);

  const handleNameConfirm = useCallback(async (name: string) => {
    setNoteName(name);
    const tmpl = await templateService.findTemplateForDirectory(parentPath);
    if (tmpl) {
      setTemplate(tmpl);
      const initial: Record<string, unknown> = {};
      for (const field of tmpl.fields) {
        if (field.defaultValue !== undefined) {
          initial[field.name] = field.defaultValue;
        } else if (field.type === 'tags') {
          initial[field.name] = [];
        } else if (field.type === 'checkbox') {
          initial[field.name] = false;
        } else {
          initial[field.name] = '';
        }
      }
      setFieldValues(initial);
      setStep('variables');
    } else {
      onConfirm(name, `# ${name}\n\n`);
    }
  }, [parentPath, templateService, onConfirm]);

  const handleVariableConfirm = useCallback(() => {
    const content = templateService.applyTemplateToContent(template!, fieldValues, noteName);
    onConfirm(noteName, content);
  }, [noteName, template, fieldValues, templateService, onConfirm]);

  if (step === 'variables' && template) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-bg-primary rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
          <h2 className="text-lg font-bold mb-4">Fill Template: {noteName}</h2>
          <div className="space-y-4">
            {template.fields.filter(f => !f.autoSet).map(field => (
              <VariableField
                key={field.name}
                field={field}
                value={fieldValues[field.name]}
                onChange={val => setFieldValues(prev => ({ ...prev, [field.name]: val }))}
              />
            ))}
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-border rounded hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleVariableConfirm}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PromptDialog
      title="New Note"
      defaultValue="untitled"
      placeholder="Enter note name"
      confirmText="Next"
      onConfirm={handleNameConfirm}
      onCancel={onCancel}
    />
  );
});

interface VariableFieldProps {
  field: TemplateField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function VariableField({ field, value, onChange }: VariableFieldProps) {
  if (field.type === 'text') {
    return (
      <div>
        <label className="block text-sm font-medium mb-1">{field.name}</label>
        <input
          type="text"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
        />
      </div>
    );
  }

  if (field.type === 'date') {
    return (
      <div>
        <label className="block text-sm font-medium mb-1">{field.name}</label>
        <input
          type="date"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
        />
      </div>
    );
  }

  if (field.type === 'tags') {
    const tags = Array.isArray(value) ? value : [];
    const [input, setInput] = useState('');
    const handleAddTag = () => {
      if (!input.trim()) return;
      onChange([...tags, input.trim()]);
      setInput('');
    };
    return (
      <div>
        <label className="block text-sm font-medium mb-1">{field.name}</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent rounded text-sm">
              {tag}
              <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))}>×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
            placeholder="Add tag..."
          />
          <button type="button" onClick={handleAddTag} className="px-3 py-2 bg-primary text-primary-foreground rounded">+</button>
        </div>
      </div>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4"
        />
        <span className="text-sm font-medium">{field.name}</span>
      </label>
    );
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/render/src/components/common/NewNoteDialog.tsx
git commit -m "feat(render): add NewNoteDialog with template variables"
```

### Task 10: Integrate NewNoteDialog into VaultTree and VaultService

- [ ] **Step 1: Modify VaultTree to use NewNoteDialog**

In `apps/render/src/components/explorer/VaultTree.tsx`:

- Replace `PromptDialog` for new file with `NewNoteDialog`
- Add `navigate` import from react-router
- When creating a note with a template, navigate to the new note path after creation

- [ ] **Step 2: Modify VaultService.createNote to accept optional content**

Update `VaultService.createNote(parentPath: string, name: string, content?: string)` to use provided content instead of default `# ${name}\n\n`.

- [ ] **Step 3: Commit**

```bash
git add apps/render/src/components/explorer/VaultTree.tsx apps/render/src/services/vault.service.ts
git commit -m "feat(render): wire NewNoteDialog into VaultTree"
```

---

## Chunk 9: Verify and Test

- [ ] **Step 1: Run build to check for type errors**

```bash
pnpm build 2>&1 | head -60
```

Expected: No errors related to new code. Fix any import/path issues.

- [ ] **Step 2: Run lint**

```bash
pnpm lint 2>&1 | head -40
```

Expected: Clean output or only pre-existing issues.

- [ ] **Step 3: Manual test checklist**

1. Open a vault
2. Go to Settings > Templates
3. Create a new template with frontmatter fields
4. Add a directory mapping
5. In VaultTree, right-click a folder and create a new note
6. Verify the template variables dialog appears (if mapping exists)
7. Verify the note is created with template content applied
8. Verify navigation to the new note

---

## Dependencies Between Chunks

Chunk 1 → Chunk 2 → Chunk 3 → Chunk 4 → Chunk 5 → Chunk 6 → Chunk 7 → Chunk 8 → Chunk 9

Chunks 1-5 are pure data/interface layers with no UI. Chunks 6-8 build the UI on top. Chunk 9 verifies.
