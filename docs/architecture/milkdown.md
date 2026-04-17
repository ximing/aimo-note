# Milkdown v7 Editor Integration

## Overview

aimo-note uses [Milkdown](https://milkdown.dev/) v7 as its markdown editor. Milkdown is a plugin-driven WYSIWYG markdown editor built on ProseMirror and remark.

## Packages

```json
{
  "@milkdown/react": "^7.0.0",
  "@milkdown/kit": "^7.0.0",
  "@milkdown/plugin-history": "^7.0.0",
  "@milkdown/plugin-listener": "^7.0.0"
}
```

## Core Concepts

### Provider Pattern

Milkdown requires a `MilkdownProvider` wrapper:

```tsx
import { MilkdownProvider } from '@milkdown/react';

function App() {
  return (
    <MilkdownProvider>
      <MilkdownEditor />
    </MilkdownProvider>
  );
}
```

### useEditor Hook

Creates and configures the editor instance:

```tsx
import { useEditor } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';

const { loading, get } = useEditor((root) => {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, '# Hello');
    })
    .use(commonmark);
}, []);
```

### useInstance Hook

Access the editor instance for programmatic control:

```tsx
import { useInstance } from '@milkdown/react';
import { getMarkdown } from '@milkdown/kit/utils';

const [loading, getEditor] = useInstance();

const handleGetContent = () => {
  const editor = getEditor();
  if (editor) {
    const markdown = editor.action(getMarkdown());
    console.log(markdown);
  }
};
```

## Available Plugins

### Presets
- `@milkdown/kit/preset/commonmark` - CommonMark support

### Plugins
- `@milkdown/kit/plugin/history` - Undo/redo
- `@milkdown/kit/plugin/listener` - Event listeners (markdownUpdated, etc.)
- `@milkdown/kit/plugin/clipboard` - Clipboard support
- `@milkdown/kit/plugin/upload` - File upload
- `@milkdown/kit/plugin/indent` - List indentation
- `@milkdown/kit/plugin/prism` - Syntax highlighting
- `@milkdown/kit/plugin/slash` - Slash commands

## Custom Extensions

### Wiki-link Support (`[[note]]`)

Implement custom wiki-link parsing:

```typescript
import { Plugin, schema } from '@milkdown/kit/core';
import { InputRule } from '@milkdown/kit/prose';

const wikiLinkRule = new InputRule(
  /\[\[([^\]]+)\]\]$/,
  (state, match, start, end) => {
    // Create wiki-link node
  }
);
```

### Tag Support (`#tag`)

Implement hashtag parsing similarly.

## Editor Component Structure

```
components/editor/
├── MilkdownEditor.tsx      # Main editor with provider
├── MilkdownEditorInner.tsx # Inner editor implementation
├── EditorStatus.tsx        # Word count, character count
├── EditorToolbar.tsx       # Formatting toolbar (TODO)
├── SuggestionPopup.tsx     # Autocomplete popup (TODO)
└── index.ts
```

## Usage Example

```tsx
import { MilkdownEditor } from './components/editor';

function NoteEditor({ path, initialContent, onSave }) {
  return (
    <MilkdownEditor
      defaultValue={initialContent}
      onChange={(markdown) => {
        // Auto-save or mark dirty
      }}
    />
  );
}
```

## Styling

Milkdown uses CSS for editor styling. Add to `index.css`:

```css
.milkdown-wrapper {
  height: 100%;
}

.milkdown-wrapper .milkdown {
  height: 100%;
  padding: 1rem;
}

.milkdown-wrapper .ProseMirror {
  height: 100%;
  outline: none;
}
```

## Resources

- [Milkdown Docs](https://milkdown.dev/docs)
- [Milkdown GitHub](https://github.com/Milkdown/milkdown)
- [API Reference](https://milkdown.dev/api)
