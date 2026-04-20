# Frontmatter 编辑器区域设计

## 1. 概述

在文档标题（文件名输入框）下方、编辑器上方，新增一个专门用于展示和编辑 Frontmatter 的区域。当文档没有 Frontmatter 时，该区域不显示（除非用户主动点击"添加 Frontmatter"）。

## 2. 目标

- 支持通过模板或手动创建 Frontmatter，保存到本地 md 文件
- 编辑器内可直接编辑 Frontmatter 字段
- 支持动态添加/删除任意字段（模板定义的字段也可额外添加自定义字段）
- 有 `title` 字段时与文件名输入框双向同步

## 3. 架构

### 3.1 数据流

```
文件 → gray-matter 解析 → IPC 返回 { path, content, frontmatter }
                              ↓
                    editor.service 扩展存储 frontmatter
                              ↓
                    FrontmatterPanel ←→ MilkdownEditor
                              ↓
                    保存时序列化回 YAML 注入 content 开头
```

### 3.2 改动范围

| 层级 | 文件 | 改动 |
|------|------|------|
| core | `packages/core/src/vault/reader.ts` | `readNote` 返回完整 frontmatter |
| core | `packages/core/src/vault/writer.ts` | `writeNote` 支持更新 frontmatter |
| client | `apps/client/src/main/ipc/handlers.ts` | IPC 通道传递 frontmatter |
| render | `apps/render/src/services/editor.service.ts` | 存储 frontmatter 状态 |
| render | `apps/render/src/pages/editor/index.tsx` | 布局调整 + 引入 FrontmatterPanel |
| render | 新增 `apps/render/src/components/editor/FrontmatterPanel.tsx` | Frontmatter 表单组件 |

## 4. Core 层改动

### 4.1 `readNote` 返回完整数据

```typescript
// packages/core/src/vault/reader.ts
export async function readNote(vaultPath: string, notePath: string) {
  const fullPath = path.join(vaultPath, notePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const { data, content: body } = matter(content);
  return { path: notePath, content: body, frontmatter: data };
}
```

### 4.2 `writeNote` 支持 frontmatter 更新

`writeNote` 已有 `frontmatter` 参数，写入时用 `matter.stringify()` 重新拼接。

### 4.3 IPC 层

`apps/client/src/main/ipc/handlers.ts` 中 `vault:readNote` 返回 `{ path, content, frontmatter }` 而非仅 `{ path, content }`。

## 5. FrontmatterPanel 组件

### 5.1 布局位置

正常文档流，位于文件名输入框下方、编辑器上方：

```
┌─────────────────────────────┐
│  文件名输入框 (file-name-header)  │
├─────────────────────────────┤
│  FrontmatterPanel           │
│  ┌──────────────────────┐  │
│  │ title: [输入框]   [−] │  │
│  │ tags:  [输入框]   [−] │  │
│  │            [+ 添加字段] │  │
│  └──────────────────────┘  │
├─────────────────────────────┤
│  MilkdownEditor             │
└─────────────────────────────┘
```

### 5.2 字段编辑形式

每个字段一行：标签（固定宽度） + 输入框（自适应）+ 删除按钮。

**支持的字段类型：**
- 文本：普通输入框
- 日期：日期选择器
- 数组（逗号分隔）：普通输入框，保存时 split 成数组

类型由 `gray-matter` 解析后的 JS 类型自动判断：
- `string` → 文本输入框
- `string` 且值匹配日期格式（YYYY-MM-DD）→ 日期选择器
- `string[]` / `number[]` → 数组输入框（渲染时 join 成逗号字符串，保存时 split）

### 5.3 字段增删

- 每行右侧有 `−` 删除按钮
- 底部有 `+ 添加字段` 按钮，点击弹出：字段名输入框 + 类型选择（下拉：文本/日期/数组）
- 新添加的字段默认类型为"文本"

### 5.4 无 Frontmatter 时的行为

- 面板默认不渲染
- 面板顶部显示 `+ 添加 Frontmatter` 文字按钮
- 点击后生成空白面板，显示空的 title 字段（允许删除）

### 5.5 title 同步

- `FrontmatterPanel` 读取/写入 frontmatter 中的 `title` 字段
- `title` 变化时，通知 `editor.service` 更新文件名输入框（`fileName`）
- 文件名输入框变化时，同步回 frontmatter 的 `title` 字段
- 同步在 `editor.service` 层集中处理

### 5.6 保存逻辑

用户编辑字段后，不立即写文件。在以下时机触发保存：
1. 切换笔记（切标签/侧边栏点击）
2. 手动 Ctrl+S
3. 300ms 防抖后自动保存（编辑框失焦）

保存时：将 frontmatter 对象序列化为 YAML，拼接 `---` 分隔符，插入到 `content` 开头，再调用 `writeNote`。

## 6. 渲染器层服务扩展

### 6.1 editor.service 扩展

```typescript
// apps/render/src/services/editor.service.ts
currentNote: {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>; // 新增
} | null = null;
```

`saveNote` 方法同步更新 frontmatter 到 content 再写入。

### 6.2 布局调整

`apps/render/src/pages/editor/index.tsx` 当前结构：
```
file-name-header
  └─ 文件名输入框
MilkdownEditor
```

改为：
```
file-name-header
  └─ 文件名输入框
FrontmatterPanel（条件渲染）
  └─ 字段表单
MilkdownEditor
```

## 7. 样式

- Frontmatter 面板：浅色背景，底部 `1px` 分割线与编辑器分隔
- 字段行：flex 布局，标签 `120px` 固定宽度右对齐，输入框 `flex: 1`
- 添加/删除按钮：icon 样式（SVG），hover 变色
- 无 frontmatter 时的"添加"文字按钮：轻量样式，与面板背景一致

## 8. 错误处理

- 解析失败（如 YAML 格式错误）：静默忽略，frontmatter 置为空对象，文档正文正常加载
- 保存失败：toast 提示错误，保留内存状态，用户可重试
- title 同步循环：设置标志位防止死循环

## 9. 测试要点

- 新建笔记 → 添加 frontmatter → 保存 → 重启后数据存在
- 编辑已有 frontmatter 的笔记 → 修改字段 → 保存 → 验证文件内容
- title 双向同步正常
- 无 frontmatter 笔记不显示面板
- 模板字段 + 自定义字段共存
