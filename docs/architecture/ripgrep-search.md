# Ripgrep 搜索说明

## 为什么需要这份文档

本项目在 Electron 主进程中使用 `@vscode/ripgrep` 实现侧边栏内容搜索。调试过程中我们发现，最容易让人困惑的点是 ripgrep 在 JSON 模式下如何返回匹配偏移量。

这份说明记录了它的准确行为、本仓库中的集成位置，以及在渲染层实现高亮时需要避免的陷阱。

## 本仓库中的集成方式

### 主进程

搜索相关的 IPC 实现在 `apps/client/src/main/ipc/handlers.ts`。

当前流程：

1. 渲染进程调用 `search.search(options)`
2. 主进程构建 ripgrep 参数
3. `rgFiles(args)` 拉起 `@vscode/ripgrep` 二进制程序
4. 主进程逐行解析 `--json` 输出
5. 主进程将每个 ripgrep `submatch` 归一化为适合渲染层使用的搜索结果
6. 渲染进程按文件分组结果并渲染高亮片段
7. 高亮渲染使用预先计算好的字符索引以及匹配到的文本本身

相关文件：

- `apps/client/src/main/ipc/handlers.ts`
- `apps/render/src/ipc/search.ts`
- `apps/render/src/services/search.service.ts`
- `apps/render/src/components/left-sidebar/SearchResultItem.tsx`
- `packages/dto/src/search.ts`

当前每个匹配项共享的字段：

- `text`: ripgrep 返回的原始行文本
- `matchedText`: ripgrep 为该命中返回的精确匹配文本
- `charStart` / `charEnd`: 在主进程中预先计算好的字符索引
- `byteStart` / `byteEnd`: 保留用于调试的 ripgrep 原始字节偏移

## 当前的 Ripgrep 参数

主进程当前调用 ripgrep 时，等价参数如下：

```bash
rg --heading --json --max-count=10 --glob=!.* --glob=!node_modules <query> <rootPath>
```

行为开关：

- 搜索不区分大小写时添加 `--ignore-case`
- 搜索不是正则模式时添加 `--fixed-strings`

## 重要的 JSON 语义

实际的 ripgrep 匹配事件大致如下：

```json
{
  "type": "match",
  "data": {
    "path": { "text": "/abs/path/to/file.md" },
    "lines": {
      "text": "some text before 啊 some text after\n"
    },
    "line_number": 11,
    "absolute_offset": 32,
    "submatches": [
      {
        "match": { "text": "啊" },
        "start": 54,
        "end": 57
      }
    ]
  }
}
```

### `start` 和 `end` 的含义

`submatches[].start` 和 `submatches[].end` 是相对于 `data.lines.text` 的偏移量，单位是字节，而不是 JavaScript 字符串索引。

对于 UTF-8 文本，这一点非常关键：

- ASCII 字符通常占 1 个字节
- 中文字符通常占 3 个字节
- emoji 在 UTF-8 中通常占 4 个字节
- JavaScript 字符串切片使用的是 UTF-16 代码单元索引，而不是 UTF-8 字节偏移

所以这样写是错误的：

```ts
text.slice(byteStart, byteEnd);
```

因为 `byteStart` 和 `byteEnd` 并不是字符串索引。

## 本地实验验证的行为

我们使用真实文件 `退退退.md`，并通过应用所使用的同一个 ripgrep 二进制进行了测试。

某一行的观察结果：

- 行文本里包含多个 `啊`
- ripgrep 返回了类似 `54..57`、`87..90`、`128..131` 的字节区间
- 将这些字节偏移转换为 JavaScript 字符串索引后，能够正确定位到预期的 `啊` 字符

这说明：

1. ripgrep 的 JSON 输出本身是正确的
2. 在进行任何 JS 字符串切片前，必须先把 UTF-8 字节偏移转换掉
3. 对整行长文本进行渲染时，即使实际匹配正确，也可能在视觉上误以为高亮位置错了
4. 仅依赖偏移量来渲染 UI 仍然比较脆弱；应当同时传递精确的 `matchedText` 作为第二份可信依据

## 渲染层的常见陷阱

### 1. UTF-8 字节偏移 vs JS 字符串索引

渲染层在调用 `slice()` 之前，必须先把 UTF-8 字节偏移转换成 JavaScript 字符串索引。

### 2. `lines.text` 尾部换行符

`data.lines.text` 通常会包含该行结尾的换行符。渲染预览之前，最好先去掉尾部的 `\n` 或 `\r\n`。

### 3. HTML 中的空白折叠

如果 UI 把多个空格、制表符或混合空白折叠了，那么即使计算出来的区间是正确的，高亮在视觉上也可能看起来像是偏移了。

推荐给结果文本使用的 CSS：

```css
white-space: pre-wrap;
overflow-wrap: anywhere;
```

### 4. 超长行

直接展示整行内容会让人很难直观看出匹配位置。对于长行，应只渲染匹配点附近的一小段片段，而不是整行。

这样可以提升可扫读性，也能避免把问题误判为偏移错误。

## 推荐的实现策略

### 主进程职责

1. 解析 ripgrep JSON 输出
2. 保留原始 `byteStart` / `byteEnd` 以便调试
3. 在主进程中一次性把字节偏移转换为 `charStart` / `charEnd`
4. 将 ripgrep 返回的 `matchedText` 与转换后的索引一起返回

伪代码：

```ts
function utf8ByteOffsetToStringIndex(text: string, byteOffset: number): number {
  if (byteOffset <= 0) return 0;

  let currentByteOffset = 0;
  let stringIndex = 0;

  for (const char of text) {
    const nextByteOffset = currentByteOffset + Buffer.byteLength(char, 'utf8');
    if (nextByteOffset > byteOffset) break;
    currentByteOffset = nextByteOffset;
    stringIndex += char.length;
  }

  return stringIndex;
}
```

### 渲染层职责

1. 去掉 ripgrep 行文本末尾的换行符
2. 直接使用 `charStart` / `charEnd`，不要再从字节偏移重新计算
3. 使用 `matchedText` 作为渲染保护，避免高亮区间在无提示的情况下漂移到空白位置
4. 只渲染命中点前后的一小段上下文
5. 通过 CSS 保留原始空白

## `退退退.md` 案例的最终经验

最终的 bug 表现很微妙：搜索结果有时看起来像是把句子末尾附近的一段空白高亮了，但实际上 ripgrep 返回的命中是正确的。

最后真正奏效的做法：

- 把 UTF-8 字节到字符索引的转换移动到主进程
- 在 DTO 中加入 `matchedText`，而不是只相信偏移量
- 让渲染层直接消费 `charStart` / `charEnd`
- 构建最终高亮片段时，用 `matchedText.length` 作为保护条件

这样 UI 会更稳健，因为渲染层不再基于已解析好的 ripgrep 结果，重复执行一套对编码敏感的逻辑。

## 实用规则

- 把 ripgrep JSON 偏移量视为 UTF-8 字节偏移
- 永远不要把 ripgrep 的 `start` 和 `end` 直接传给 `String.prototype.slice`
- 优先在主进程中一次性完成偏移量转换，而不是在多个 UI 组件里重复做
- 让 `matchedText` 穿过 IPC 边界，作为正确性保护
- 渲染预览前先规范化行文本
- 当 UI 需要与源文本视觉对齐时，保留空白字符
- 对长内容优先使用以命中为中心的片段，而不是整行预览

## 调试检查清单

当搜索高亮看起来不对时：

1. 确认该行对应的原始 ripgrep JSON 事件
2. 检查 `lines.text` 是否仍然包含尾部换行
3. 检查主进程和渲染层对 `matchedText`、`charStart`、`charEnd` 的理解是否一致
4. 检查渲染层是否还有任何地方直接使用字节偏移
5. 检查 CSS 是否折叠了空格或制表符
6. 检查问题是否只是因为行太长而造成的视觉误判

## 建议的后续改进

如果搜索预览的正确性变得非常关键，主进程还可以更进一步，直接返回一个完全适合渲染层使用的预览片段，例如：

- `previewText`
- `previewMatchStart`
- `previewMatchEnd`

这样几乎所有预览格式化逻辑都会集中到一处，UI 中重复出现的渲染 bug 也会进一步减少。
fan
