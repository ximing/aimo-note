# Vault 核心功能设计

## 概述

实现 Obsidian 风格的基础笔记功能：打开/创建 Vault、文件树浏览、Milkdown 所见即所得编辑、右键菜单操作。

## 架构分层

```
┌─────────────────────────────────────────────┐
│  apps/render (React SPA)                   │
│  ├── pages/home/     - Vault 选择界面      │
│  ├── components/explorer/ - 文件树组件      │
│  ├── components/editor/ - Milkdown 编辑器  │
│  ├── services/        - VaultService       │
│  └── ipc/             - IPC 客户端封装      │
├─────────────────────────────────────────────┤
│  apps/client (Electron Main)                │
│  ├── ipc/handlers.ts  - IPC 处理器         │
│  └── preload/         - electronAPI 暴露   │
├─────────────────────────────────────────────┤
│  packages/core (纯 Node.js)                │
│  ├── vault/reader.ts   - 文件读             │
│  └── vault/writer.ts  - 文件写             │
└─────────────────────────────────────────────┘
```

## 功能模块

### 1. Vault 打开/创建

**UI 入口**：`home/index.tsx`

**行为**：

- 未打开 Vault 时，显示欢迎界面 + "Open vault" + "Create new vault" 按钮
- 点击 "Open vault" → 打开系统文件夹选择对话框 → 选中的文件夹作为 vault path
- 点击 "Create new vault" → 选择新建文件夹位置 → 创建空 vault 目录结构
- Vault 打开后，跳转到编辑器页面，显示文件树

**数据流**：

```
Renderer: home page
  → IPC: vault.selectFolder()
  → Main: dialog.showOpenDialog()
  → Core: vault.open(path)
  → Store: vaultPath in VaultService
```

### 2. 文件树

**组件**：`components/explorer/VaultTree.tsx` + `TreeNode.tsx`

**行为**：

- 显示 vault 根目录下的所有文件和文件夹
- 文件夹可展开/收起（点击箭头或文件夹名称）
- 展开时递归显示子文件/子文件夹
- 点击文件 → 打开编辑器
- 当前打开的文件高亮显示

**数据结构**：

```typescript
interface TreeNode {
  name: string;
  path: string; // 相对于 vault 的路径
  type: 'file' | 'folder';
  children?: TreeNode[];
  expanded?: boolean;
}
```

### 3. Milkdown 编辑器

**组件**：`components/editor/MilkdownEditor.tsx`

**行为**：

- 所见即所得 Markdown 编辑（使用 Milkdown v7）
- 支持 WikiLink `[[note]]` 和 Tags `#tag`
- 内容修改后自动保存（debounce 500ms）
- 顶部显示当前文件路径

### 4. 右键菜单

**组件**：`components/common/ContextMenu.tsx`

**菜单项**：
| 操作 | 行为 |
|------|------|
| New file | 弹出输入框 → 输入文件名 → 在当前目录创建空白 .md 文件 |
| New folder | 弹出输入框 → 输入文件夹名 → 在当前目录创建文件夹 |
| Rename | 弹出输入框 → 输入新名称 → 重命名文件/文件夹 |
| Delete | 确认对话框 → 删除文件/文件夹 |

**触发**：

- 在文件树节点上右键
- 在编辑器空白处右键（新建文件）

### 5. 实时保存

**行为**：

- 编辑器内容变化后 500ms 自动保存
- 保存时更新 VaultService 中的文件缓存
- 失败时显示错误提示

## 迭代计划

### Iteration 1: IPC 层打通

- [ ] client: 实现 `vault:selectFolder` handler
- [ ] client: 实现 `vault:create` handler
- [ ] preload: 暴露 `vault.selectFolder()`, `vault.create()` API
- [ ] render: IPC vault 封装调用

### Iteration 2: Vault 状态管理

- [ ] VaultService: 管理当前 vault path 和文件列表
- [ ] HomePage: 实现 Open/Create vault UI
- [ ] 打开 vault 后跳转到编辑器页面

### Iteration 3: 文件树基础

- [ ] VaultTree 组件基础结构
- [ ] TreeNode 组件（显示名称和类型图标）
- [ ] 展开/收起文件夹逻辑

### Iteration 4: 文件树交互

- [ ] 点击文件打开编辑器
- [ ] 高亮当前打开文件
- [ ] 空目录显示提示

### Iteration 5: Milkdown 编辑器

- [ ] MilkdownEditor 组件集成
- [ ] 编辑器 Service 管理当前文件
- [ ] 从 vault 读取文件内容

### Iteration 6: 文件保存

- [ ] 实现 `vault:writeNote` IPC
- [ ] 500ms debounce 自动保存
- [ ] 保存状态提示

### Iteration 7: 右键菜单基础

- [ ] ContextMenu 组件
- [ ] 在文件树节点上触发右键
- [ ] New file / New folder 菜单项

### Iteration 8: 右键菜单高级

- [ ] Rename 功能
- [ ] Delete 功能（带确认）
- [ ] 右键在编辑器空白处 → 新建文件

### Iteration 9: 完善和优化

- [ ] 文件树排序（文件夹在前，按字母排序）
- [ ] 新建文件自动打开
- [ ] 错误处理和提示

## IPC Channel 定义

| Channel              | Direction | Payload              | Response                        |
| -------------------- | --------- | -------------------- | ------------------------------- |
| `vault:selectFolder` | R→M       | -                    | `{path: string} \| null`        |
| `vault:create`       | R→M       | `{path: string}`     | `{success: boolean}`            |
| `vault:open`         | R→M       | `{path: string}`     | `{path: string, files: number}` |
| `vault:readNote`     | R→M       | `{path: string}`     | `{content, frontmatter}`        |
| `vault:writeNote`    | R→M       | `{path, content}`    | `{success: boolean}`            |
| `vault:delete`       | R→M       | `{path: string}`     | `{success: boolean}`            |
| `vault:rename`       | R→M       | `{oldPath, newPath}` | `{success: boolean}`            |
| `vault:createFolder` | R→M       | `{path: string}`     | `{success: boolean}`            |
| `vault:list`         | R→M       | `{path: string}`     | `TreeNode[]`                    |

## 技术约束

- Renderer 永远通过 IPC 访问文件系统，不直接调用 Node.js
- Milkdown v7 已集成在项目中
- 使用 `@rabjs/react` 进行状态管理
- 所有 IPC 调用返回 Promise，支持错误处理
