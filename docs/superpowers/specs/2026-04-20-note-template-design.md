# 笔记模板系统设计

## 概述

支持按目录绑定模板，创建笔记时自动应用模板内容（frontmatter + 正文）。目录可递归向上查找模板映射直到 vault 根目录。

---

## 1. 存储结构

### 1.1 模板文件

模板存储在 vault 内 `.aimo-note/templates/*.md`，每个模板本身是标准 Markdown 文件。

```
.aimo-note/
├── config.json          # 现有配置（含模板映射）
└── templates/
    ├── default.md       # 默认模板
    ├── meeting.md       # 会议模板
    └── daily.md         # 日记模板
```

### 1.2 模板文件格式

```markdown
---
title: ''
tags: []
created: true
modified: true
custom_field: ''
---

# {{title}}
```

**frontmatter 字段类型**:

- `text` — 文本输入
- `date` — 日期选择
- `tags` — 标签输入
- `checkbox` — 复选框

**正文变量替换**: `{{字段名}}`，创建笔记时替换为用户输入的值。

### 1.3 映射配置

`.aimo-note/config.json` 中新增字段:

```json
{
  "templateMappings": {
    "": "default",
    "journals": "daily",
    "meetings": "meeting"
  }
}
```

### 1.4 模板查找逻辑

创建笔记时给定目标目录，按以下顺序查找模板:

1. 精确匹配: `目标目录` → `templates/映射值.md`
2. 递归向上: 逐级取父目录，重复步骤 1
3. 根目录: `""` 的映射作为默认模板
4. 均未找到 → 创建空白笔记（`# 笔记名\n\n`）

---

## 2. 设置页 UI

入口: Settings > Templates Tab

### 2.1 布局结构

```
┌─ Templates ────────────────────────────────────────┐
│ [+ New Template]                                     │
│                                                     │
│ ┌─ Template List ─────────────────────────────────┐ │
│ │ meeting.md    [Edit] [Delete]                   │ │
│ │ daily.md      [Edit] [Delete]                   │ │
│ │ default.md    [Edit] [Delete]                   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─ Directory Mappings ────────────────────────────┐ │
│ │ Directory        Template                       │ │
│ │ /root            [default.md ▼]                 │ │
│ │ journals/        [daily.md ▼]                   │ │
│ │ meetings/        [meeting.md ▼]                 │ │
│ │ [+ Add Mapping]                                 │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 2.2 模板编辑表单

```
Edit Template: meeting.md

┌─ Frontmatter ──────────────────────────────────────┐
│ title        [________________________]  type: text │
│ tags         [________________________]  type: tags  │
│ created      [x] auto-set on create                │
│ modified     [x] auto-set on change                │
│ [+ Add Field]                                      │
│   name: [__________]  type: [text ▼]               │
└─────────────────────────────────────────────────────┘

┌─ Body ─────────────────────────────────────────────┐
│ # {{title}}                                        │
│                                                    │
│ ## Meeting Info                                    │
│ Date: {{date}}                                     │
│ Attendees:                                         │
│                                                    │
│ ## Agenda                                          │
│                                                    │
│ ## Notes                                           │
│                                                    │
└─────────────────────────────────────────────────────┘

[Cancel]  [Save Template]
```

---

## 3. 新建笔记流程

1. 用户在 VaultTree 右键 / 工具栏点击"新建笔记"
2. 弹出 PromptDialog，输入文件名，选择目标目录
3. 根据目标目录，按递归向上查找逻辑获取模板
4. 读取模板内容，对 frontmatter 字段渲染表单收集用户输入
5. 替换正文中的 `{{变量}}` 为实际值
6. 创建文件（内容为填充后的模板）
7. 调用 `vaultService.createNote()` 并 `navigate()` 到新笔记

---

## 4. 核心模块变更

### 4.1 Core 层 — `packages/core/src/vault/`

| 文件          | 职责                                       |
| ------------- | ------------------------------------------ |
| `template.ts` | 模板读取、写入、frontmatter 解析、变量替换 |

### 4.2 DTO 层 — `packages/dto/src/`

| 文件          | 职责                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `template.ts` | 模板相关类型定义 (`Template`, `TemplateMapping`, `TemplateField` 等) |

### 4.3 Client 层 — `apps/client/`

| 变更         | 职责                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| IPC handlers | 新增模板 CRUD（createTemplate, readTemplate, updateTemplate, deleteTemplate, listTemplates, getTemplateMappings, setTemplateMapping） |

### 4.4 Renderer 层

| 文件                                             | 职责                                       |
| ------------------------------------------------ | ------------------------------------------ |
| `services/template.service.ts`                   | 全局模板状态管理                           |
| `pages/settings/components/TemplateSettings.tsx` | 设置页模板管理 Tab                         |
| `components/template/TemplateEditor.tsx`         | 模板编辑器（frontmatter 表单 + body 编辑） |
| `services/vault.service.ts`                      | `createNote()` 集成模板查找和应用逻辑      |

---

## 5. 变量替换规则

- `{{字段名}}` 在正文中被用户输入值替换
- frontmatter 中 `created: true` → 自动写入创建时间戳
- frontmatter 中 `modified: true` → 自动写入修改时间戳
- frontmatter 中 `title: ""` → 自动从文件名填充

---

## 6. 约束

- 模板文件禁止放在 `.aimo-note/` 目录外
- 模板映射仅精确匹配目录路径，不支持通配符
- 递归向上查找最深到 vault 根目录（`""` 映射）
- 模板编辑器必须使用表单编辑，不支持直接编辑 YAML
