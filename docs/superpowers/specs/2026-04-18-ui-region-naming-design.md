# UI 区域命名设计方案

## 概述

参考 Obsidian 的布局结构，为 AIMO Note 定义系统化的 UI 区域名称。

## 区域命名体系

采用 **"方位 + 功能"** 的组合方式，保持一致性和可扩展性。

### 1. Left Rail（左侧图标导航栏）

垂直排列的图标导航区域，提供全局快捷导航。

| 属性 | 值 |
|------|-----|
| 名称 | Left Rail |
| CSS class | `.left-rail` |
| 功能 | 搜索、文件、图谱、设置等全局 icon 导航 |
| 位置 | 窗口最左侧，垂直细长条 |

### 2. Explorer（文件目录树）

显示 vault 中文件和文件夹的层级结构。

| 属性 | 值 |
|------|-----|
| 名称 | Explorer 或 File Explorer |
| CSS class | `.explorer` |
| 功能 | 文件/文件夹的增删改查、展开折叠、排序 |
| 位置 | Left Rail 右侧 |

### 3. Title Bar Actions（标题栏操作区）

macOS 原生窗口栏（红绿灯）旁边的自定义操作图标区域。

| 属性 | 值 |
|------|-----|
| 名称 | Title Bar Actions |
| CSS class | `.titlebar-actions` |
| 功能 | 搜索开关、文件树快捷方式等 |
| 位置 | macOS 窗口红绿灯右侧 |

### 4. Editor Tabs（编辑器标签页）

管理多个打开的文档，支持单文档多标签。

| 属性 | 值 |
|------|-----|
| 名称 | Editor Tabs |
| CSS class | `.editor-tabs` |
| 功能 | 多文档标签管理、激活状态 |
| 交互 | 单击在当前 tab 打开，双击开新 tab |

### 5. Side Panel（侧边面板）

右侧可折叠的面板区域，用于显示文档相关信息。

| 属性 | 值 |
|------|-----|
| 名称 | Side Panel |
| CSS class | `.side-panel` |
| 功能 | Backlinks、大纲、标签等辅助信息 |
| 位置 | 主内容区右侧，可折叠 |

## 布局结构图

```
┌──────────────────────────────────────────────────────────┐
│ [● ● ●]  [🔍] [📁]           Title Bar Actions           │
├────────┬─────────────────────────────────────────────────┤
│  Left  │                                                  │
│  Rail  │          Main Content Area                       │
│        │  ┌──────────────────────────────────────────┐   │
│ [🔍]   │  │ Editor Tabs (Tab1 | Tab2 | Tab3...)     │   │
│ [📁]   │  ├──────────────────────────────────────────┤   │
│ [📊]   │  │                                          │   │
│ [⚙️]   │  │          Document Editor                  │   │
│        │  │                                          │   │
│        │  └──────────────────────────────────────────┘   │
│        │                              ┌──────────────┐   │
│        │                              │  Side Panel  │   │
│        │                              │  (Backlinks) │   │
├────────┴──────────────────────────────┴──────────────┤
│                  Status Bar                            │
└──────────────────────────────────────────────────────┘
```

## CSS 命名约定

遵循 TypeScript 规则中的 kebab-case 规范：

| 区域 | class 名 | 备注 |
|------|----------|------|
| Left Rail | `.left-rail` | 整个左侧图标栏容器 |
| Explorer | `.explorer` | 文件树容器 |
| Title Bar Actions | `.titlebar-actions` | 标题栏操作区 |
| Editor Tabs | `.editor-tabs` | 标签页容器 |
| Side Panel | `.side-panel` | 右侧面板容器 |

## 实现优先级

1. **Phase 1**: Left Rail + Explorer（新增布局区域）
2. **Phase 2**: Title Bar Actions（红绿灯旁边区域）
3. **Phase 3**: Editor Tabs（多 tab 支持）
4. **Phase 4**: Side Panel（右侧面板）

## 状态

✅ 已用户确认
