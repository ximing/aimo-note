# Frontmatter 编辑器实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在文档标题下方添加 Frontmatter 区域，支持显示/编辑/动态增删字段，frontmatter 数据保存到本地 md 文件。

**Architecture:**
- Core 层 IPC handler 直接解析 gray-matter，返回 frontmatter 给渲染层
- 渲染层 editor.service 管理 frontmatter 状态
- 新增 `FrontmatterPanel` React 组件，位于文件名输入框和编辑器之间
- 保存时将 frontmatter 序列化为 YAML，拼接 `---` 注入到 content 开头

**Tech Stack:** React 19, RSJS (@rabjs/react), Milkdown v7, gray-matter, TypeScript

---

## Chunk 1: IPC 层改造（core → IPC → render 通道打通）

### 1.1 更新 preload 类型定义

**Files:**
- Modify: `apps/client/src/preload/index.ts:69-76`

`VaultResult` 需要新增 `frontmatter` 字段，同时 `writeNote` 支持传入 frontmatter：

```typescript
// apps/client/src/preload/index.ts

export interface VaultResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  tree?: TreeNode[];
  content?: string;
  frontmatter?: Record<string, unknown>; // 新增
  error?: string;
}
```

`writeNote` 的 `vault` 接口需要扩展（不改签名，用 content 传 frontmatter 序列化后的完整内容）——实际上，writeNote 不需要改签名，因为写入时 render 层会自己把 frontmatter 注入到 content 里。

**具体改动：**
```typescript
// apps/client/src/preload/index.ts line 160-161
readNote: (vaultPath: string, filePath: string) =>
  ipcRenderer.invoke('vault:readNote', vaultPath, filePath) as Promise<VaultResult & { frontmatter?: Record<string, unknown> }>,
```

### 1.2 更新 IPC vault 通道类型

**Files:**
- Modify: `apps/render/src/ipc/vault.ts:1-18`

`Vault` 接口扩展 `readNote` 返回值包含 frontmatter：

```typescript
// apps/render/src/ipc/vault.ts line 8-10
export interface Vault {
  // ...
  readNote(vaultPath: string, path: string): Promise<{ path: string; content: string; frontmatter: Record<string, unknown> }>;
  writeNote(vaultPath: string, path: string, content: string): Promise<void>;
  // ...
}
```

`readNote` 实现改为解析 frontmatter 并返回：

```typescript
// apps/render/src/ipc/vault.ts line 33-39
async readNote(vaultPath: string, filePath: string) {
  const result = await window.electronAPI!.vault.readNote(vaultPath, filePath);
  if (!result.success) {
    throw new Error(result.error);
  }
  // result.content 是原始 markdown（含 --- frontmatter block）
  // gray-matter 解析在前端做（避免改动 main process）
  const { data, content: body } = matter(result.content || '');
  return { path: filePath, content: body, frontmatter: data };
},
```

需要 import matter：
```typescript
import matter from 'gray-matter';
```

### 1.3 更新 handlers.ts 使用 gray-matter 解析

**Files:**
- Modify: `apps/client/src/main/ipc/handlers.ts:326-334`

当前 `vault:readNote` 只返回原始 content，需要用 gray-matter 解析后返回 frontmatter：

```typescript
// apps/client/src/main/ipc/handlers.ts line 326-334
ipcMain.handle('vault:readNote', async (_event, vaultPath: string, filePath: string) => {
  try {
    const fullPath = path.join(vaultPath, filePath);
    const rawContent = await fs.readFile(fullPath, 'utf-8');
    const { data, content: body } = matter(rawContent);
    return { success: true, content: body, frontmatter: data };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
```

需要在 `handlers.ts` 顶部添加 `import matter from 'gray-matter';`（已存在于 line 10）。

---

## Chunk 2: editor.service 改造（frontmatter 状态管理）

### 2.1 扩展 editor.service 的 currentNote 类型

**Files:**
- Modify: `apps/render/src/services/editor.service.ts:7`

```typescript
// apps/render/src/services/editor.service.ts

export class EditorService extends Service {
  currentNote: { path: string; content: string; frontmatter: Record<string, unknown> } | null = null;
  // ...
}
```

### 2.2 更新 openNote 接收 frontmatter

**Files:**
- Modify: `apps/render/src/services/editor.service.ts:48-54`

```typescript
// apps/render/src/services/editor.service.ts line 48-54
const note = await vault.readNote(vaultPath, path);
this.currentNote = { path, content: note.content, frontmatter: note.frontmatter };
this.content = note.content;
```

### 2.3 新增 frontmatter 读写方法

**Files:**
- Modify: `apps/render/src/services/editor.service.ts` (在 `saveNote` 方法后添加)

```typescript
// apps/render/src/services/editor.service.ts

getFrontmatter(): Record<string, unknown> {
  return this.currentNote?.frontmatter ?? {};
}

updateFrontmatter(frontmatter: Record<string, unknown>): void {
  if (!this.currentNote) return;
  this.currentNote = { ...this.currentNote, frontmatter };
  this.isDirty = true;
}
```

### 2.4 更新 saveNote 将 frontmatter 序列化写回

**Files:**
- Modify: `apps/render/src/services/editor.service.ts:109`

`saveNote` 当前直接写 `this.content`，需要改为将 frontmatter 注入 content 开头再写：

```typescript
// apps/render/src/services/editor.service.ts line 109
// 在 this.content 写入前，用 matter.stringify() 拼接 frontmatter
const vaultPath = this.vaultService?.path;
// 获取 frontmatter
const frontmatter = this.currentNote?.frontmatter;
// 序列化 content（包含 frontmatter）
const finalContent = frontmatter && Object.keys(frontmatter).length > 0
  ? matter.stringify(this.content, frontmatter)
  : this.content;
await vault.writeNote(vaultPath, note.path, finalContent);
```

需要 import matter：
```typescript
import matter from 'gray-matter';
```

### 2.5 处理 title 双向同步

**Files:**
- Modify: `apps/render/src/services/editor.service.ts`

在 `updateFrontmatter` 中同步 title 到文件名：

```typescript
updateFrontmatter(frontmatter: Record<string, unknown>): void {
  if (!this.currentNote) return;
  this.currentNote = { ...this.currentNote, frontmatter };
  this.isDirty = true;
  // title 同步逻辑将通过事件通知 editor page
  this.emit('frontmatterChanged', frontmatter);
}
```

（注：`Service` 继承自 `@rabjs/react` 的 `Service`，支持 `emit` 事件机制。如果不支持，后续改为直接在组件内订阅 `editorService` 的 frontmatter 字段变化。）

---

## Chunk 3: FrontmatterPanel 组件

### 3.1 创建 FrontmatterPanel 组件

**Files:**
- Create: `apps/render/src/components/editor/FrontmatterPanel.tsx`

```tsx
import { observer, useService } from '@rabjs/react';
import { EditorService } from '@/services/editor.service';
import { useState, useCallback } from 'react';
import matter from 'gray-matter';

interface FieldDef {
  key: string;
  type: 'text' | 'date' | 'array';
  value: string;
}

function inferType(value: unknown): 'text' | 'date' | 'array' {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  return 'text';
}

function serializeValue(value: unknown, type: FieldDef['type']): string {
  if (type === 'array') return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  if (type === 'date') return value instanceof Date ? value.toISOString().split('T')[0] : String(value ?? '');
  return String(value ?? '');
}

export const FrontmatterPanel = observer(() => {
  const service = useService(EditorService);
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'date' | 'array'>('text');

  const frontmatter = service.getFrontmatter();
  const hasFrontmatter = Object.keys(frontmatter).length > 0;

  const fields: FieldDef[] = Object.entries(frontmatter).map(([key, value]) => ({
    key,
    type: inferType(value),
    value: serializeValue(value, inferType(value)),
  }));

  const handleAddFrontmatter = useCallback(() => {
    const newFm = { ...frontmatter, title: '' };
    service.updateFrontmatter(newFm);
  }, [frontmatter, service]);

  const handleFieldChange = useCallback((key: string, value: string, type: FieldDef['type']) => {
    let parsedValue: unknown = value;
    if (type === 'array') parsedValue = value.split(',').map((s) => s.trim()).filter(Boolean);
    const newFm = { ...frontmatter, [key]: parsedValue };
    service.updateFrontmatter(newFm);
  }, [frontmatter, service]);

  const handleDeleteField = useCallback((key: string) => {
    const newFm = { ...frontmatter };
    delete newFm[key];
    service.updateFrontmatter(newFm);
  }, [frontmatter, service]);

  const handleAddField = useCallback(() => {
    if (!newFieldName.trim()) return;
    const newFm = { ...frontmatter, [newFieldName.trim()]: '' };
    service.updateFrontmatter(newFm);
    setNewFieldName('');
    setShowAddField(false);
  }, [frontmatter, service, newFieldName]);

  if (!hasFrontmatter) {
    return (
      <div className="frontmatter-empty px-4 py-2">
        <button
          onClick={handleAddFrontmatter}
          className="text-sm text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none"
        >
          + 添加 Frontmatter
        </button>
      </div>
    );
  }

  return (
    <div className="frontmatter-panel border-b border-border px-4 py-3">
      <div className="flex flex-col gap-2">
        {fields.map((field) => (
          <div key={field.key} className="flex items-center gap-2">
            <span className="w-[120px] text-sm text-muted-foreground text-right flex-shrink-0">
              {field.key}:
            </span>
            {field.type === 'date' ? (
              <input
                type="date"
                value={field.value}
                onChange={(e) => handleFieldChange(field.key, e.target.value, field.type)}
                className="flex-1 text-sm bg-transparent border border-border rounded px-2 py-1"
              />
            ) : (
              <input
                type="text"
                value={field.value}
                onChange={(e) => handleFieldChange(field.key, e.target.value, field.type)}
                placeholder={field.type === 'array' ? 'tag1, tag2, ...' : ''}
                className="flex-1 text-sm bg-transparent border border-border rounded px-2 py-1"
              />
            )}
            <button
              onClick={() => handleDeleteField(field.key)}
              className="text-muted-foreground hover:text-destructive text-sm px-1 cursor-pointer bg-transparent border-none"
            >
              −
            </button>
          </div>
        ))}
        {showAddField ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              placeholder="字段名"
              className="w-[120px] text-sm bg-transparent border border-border rounded px-2 py-1"
            />
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value as FieldDef['type'])}
              className="text-sm bg-transparent border border-border rounded px-2 py-1"
            >
              <option value="text">文本</option>
              <option value="date">日期</option>
              <option value="array">数组</option>
            </select>
            <button
              onClick={handleAddField}
              className="text-sm text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none"
            >
              确认
            </button>
            <button
              onClick={() => setShowAddField(false)}
              className="text-sm text-muted-foreground hover:text-destructive cursor-pointer bg-transparent border-none"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddField(true)}
            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none text-left mt-1"
          >
            + 添加字段
          </button>
        )}
      </div>
    </div>
  );
});
```

---

## Chunk 4: 布局集成（editor page 改造）

### 4.1 在 editor page 引入 FrontmatterPanel

**Files:**
- Modify: `apps/render/src/pages/editor/index.tsx:228-256`

在 `file-name-header` 和 `MilkdownEditor` 之间插入 `FrontmatterPanel`：

```tsx
{/* File Name Input */}
{service.currentNote && (
  <div className="file-name-header">
    <input
      type="text"
      value={fileName}
      onChange={handleFileNameChange}
      onFocus={() => setIsEditingFileName(true)}
      onBlur={handleFileNameBlur}
      onKeyDown={handleFileNameKeyDown}
      className="file-name-input w-full font-semibold bg-transparent border-none outline-none"
      placeholder="Untitled"
    />
  </div>
)}

{/* Frontmatter Panel */}
{service.currentNote && <FrontmatterPanel />}

<div className="editor-content flex-1 overflow-auto" onContextMenu={handleContextMenu}>
  <MilkdownEditor
    key={service.currentNote?.path || 'empty'}
    onChange={handleChange}
    defaultValue={service.content || '# New Note'}
    highlightQuery={highlightQuery}
    targetLine={Number.isFinite(targetLine) && targetLine && targetLine > 0 ? targetLine : undefined}
    editorRef={editorRef}
  />
</div>
```

需要在文件顶部 import：
```tsx
import { FrontmatterPanel } from '../../components/editor/FrontmatterPanel';
```

### 4.2 title 同步：文件名 → frontmatter

**Files:**
- Modify: `apps/render/src/pages/editor/index.tsx:93-129`

在 `handleFileNameBlur` 中，rename 成功后同步更新 frontmatter 的 title：

```typescript
// apps/render/src/pages/editor/index.tsx handleFileNameBlur 内
// 在 rename 成功后，追加同步 frontmatter title：
service.updateFrontmatter({ ...service.getFrontmatter(), title: fileName.trim() });
```

---

## Chunk 5: 样式

### 5.1 添加 frontmatter 样式

**Files:**
- Modify: `apps/render/src/styles/` (检查是否有全局样式文件)

在对应的 CSS 文件中添加：
```css
.frontmatter-panel {
  background-color: color-mix(in srgb, var(--color-bg) 50%, transparent);
}

.frontmatter-empty {
  background-color: color-mix(in srgb, var(--color-bg) 50%, transparent);
}

.frontmatter-panel input[type="text"],
.frontmatter-panel input[type="date"],
.frontmatter-panel select {
  background: transparent;
  color: var(--color-text);
}

.frontmatter-panel input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(0.5);
}
```

（具体 CSS 变量参考项目中已有的 design tokens。）

---

## 文件改动汇总

| 操作 | 文件路径 |
|------|----------|
| Modify | `apps/client/src/preload/index.ts` — VaultResult 加 frontmatter 字段 |
| Modify | `apps/client/src/main/ipc/handlers.ts` — vault:readNote 用 gray-matter 解析 |
| Modify | `apps/render/src/ipc/vault.ts` — Vault.readNote 接口加 frontmatter 返回 |
| Modify | `apps/render/src/services/editor.service.ts` — currentNote 加 frontmatter，支持读写 |
| Create | `apps/render/src/components/editor/FrontmatterPanel.tsx` — 新组件 |
| Modify | `apps/render/src/pages/editor/index.tsx` — 插入 FrontmatterPanel + title 同步 |
