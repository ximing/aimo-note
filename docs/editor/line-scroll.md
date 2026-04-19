# Milkdown 编辑器行定位方案

## 背景

搜索结果点击后，需要从侧边栏导航到编辑器并滚动到匹配行。
`?line` 参数已在 `editor/index.tsx` 中读取但未被利用。

## 当前状态

### editor/index.tsx

```typescript
// 已有代码（未被使用）
const [searchParams] = useSearchParams();
const highlightParam = searchParams.get('highlight'); // 已用
const lineParam = searchParams.get('line'); // 已读取，但未使用

// 只滚动到高亮，没滚动到指定行
useEffect(() => {
  const highlightParam = searchParams.get('highlight');
  if (!highlightParam || !editorRef.current.dom) return;
  const scrollToLine = () => {
    const pm = editorRef.current.dom;
    const highlight = pm.querySelector('.search-highlight-editor');
    if (highlight) {
      highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  const timeout = setTimeout(scrollToLine, 300);
  return () => clearTimeout(timeout);
}, [path, searchParams]);
```

### MilkdownEditorInner.tsx

- 用 `useInstance()` 获取 editor 实例
- 高亮通过 DOM tree walker 实现（`document.createTreeWalker`）
- 没有使用 ProseMirror transaction 命令系统

## Milkdown / ProseMirror 行定位 API

### 1. 获取 EditorView

```typescript
import { editorViewCtx } from '@milkdown/kit/core';

editor.action((ctx) => {
  const view = ctx.get(editorViewCtx);
  // view.state.doc — 文档节点
  // view.dispatch(tr) — 派发事务
});
```

### 2. 遍历文档找到目标行

Milkdown 使用 `doc.descendants()` 遍历节点，行号对应 `TextBlock` 节点：

```typescript
function findLinePosition(doc: Node, targetLine: number): number {
  let currentLine = 1;
  let targetPos = 0;
  let found = false;

  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.isTextblock) {
      if (currentLine === targetLine) {
        targetPos = pos;
        found = true;
        return false; // 停止遍历
      }
      currentLine++;
    }
    // 跳过叶子节点继续遍历
    return undefined;
  });

  return targetPos;
}
```

### 3. 设置 selection 并滚动

```typescript
function scrollToLine(view: EditorView, pos: number) {
  const tr = view.state.tr.setSelection(
    view.state.selection.constructor.near(pos)
  );
  view.dispatch(tr.scrollIntoView());
}
```

### 4. 完整实现

```typescript
// 在 MilkdownEditorInner.tsx 中

const scrollToLineNumber = (lineNumber: number) => {
  const editor = getEditor();
  if (!editor) return;

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const doc = view.state.doc;

    // 找到目标行位置
    let currentLine = 1;
    let targetPos = 0;
    let found = false;

    doc.descendants((node, pos) => {
      if (found) return false;
      if (node.isTextblock) {
        if (currentLine === lineNumber) {
          targetPos = pos;
          found = true;
          return false;
        }
        currentLine++;
      }
      return undefined;
    });

    if (!found) return;

    // 设置 selection 并滚动
    const tr = view.state.tr.setSelection(
      view.state.selection.constructor.near(targetPos)
    );
    view.dispatch(tr.scrollIntoView());
  });
};
```

## 修改计划

### Step 1: editor/index.tsx — 传递 line 参数

```typescript
// 传递 line 给 MilkdownEditor
<MilkdownEditor
  key={service.currentNote?.path || 'empty'}
  onChange={handleChange}
  defaultValue={service.content || '# New Note'}
  highlightQuery={highlightQuery}
  editorRef={editorRef}
  targetLine={searchParams.get('line') ? Number(searchParams.get('line')) : undefined}
/>
```

### Step 2: MilkdownEditor.tsx — 透传 targetLine

在 `MilkdownEditor.tsx` 的 props 接口加 `targetLine?: number`，传给 `MilkdownEditorInner`。

### Step 3: MilkdownEditorInner.tsx — 实现滚动逻辑

```typescript
export interface MilkdownEditorInnerProps {
  highlightQuery?: string;
  targetLine?: number;
  // ...existing props
}

// useEffect 中处理行滚动
useEffect(() => {
  if (targetLine) {
    scrollToLineNumber(targetLine);
  }
}, [targetLine]);
```

## 注意事项

1. **依赖 `useInstance`**：需要通过 `useInstance()` 获取 editor 实例
2. **加载时机**：editor 内容可能尚未加载完毕，需要等待 `loadingRef.current === false`
3. **与高亮的交互**：行滚动和高亮可以同时生效，先滚动到行，再应用高亮
4. **TypeScript 类型**：从 `@milkdown/kit/core` 获取 `editorViewCtx`，从 `@milkdown/kit/prose/view` 获取 `EditorView`，从 `@milkdown/kit/prose/state` 获取 `EditorState`

## 替代方案（不做行号转换，直接用 DOM）

如果 Milkdown 的行节点定位不精确，也可以用 DOM 方式：
- 用 `editorRef.current.dom` 获取 `.ProseMirror` 根元素
- 遍历 `<p>` 子元素计数到目标行
- 用 `element.scrollIntoView()` 滚动

但这不如 ProseMirror 命令系统精确，因为 DOM 结构可能与文档行不一致。