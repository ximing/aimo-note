# Titlebar 区域布局设计

## 布局结构（俯视图）

```
● ● ● left-sidebar-header ← 同一行
┌────┼──────────────────────────────────────────────────────┐
│    │                                                       │
│ LR │ left-sidebar-content                                  │
│    │                                                       │
└────┴──────────────────────────────────────────────────────┘
```

**说明**：

- `titleBarStyle: 'hidden'` 模式下，红绿灯显示在窗口左上角（macOS 原生），不在 DOM 中
- 红绿灯和 left-sidebar-header 在同一行（红绿灯占约 70px 宽度）
- left-rail 在红绿灯下方，左侧 48px 宽度
- left-sidebar-content 在 left-rail 右侧

**改动后效果**：所有区域统一为 `--bg-secondary`

## 布局层级

### 1. Title Bar Row（标题栏行）

- **位置**：DOM 中的第一行，与红绿灯同一垂直位置
- **组成**：
  - **Traffic Zone**（70px 宽度）：占据左侧空间（不在 DOM 中）
  - **Left Sidebar Header**：搜索、展开/收起按钮
- **背景色**：`--bg-secondary`
- **高度**：44px

### 2. Left Rail（左侧导航条）

- **位置**：红绿灯下方，48px 宽度
- **是否在 DOM 中**：是
- **背景色**：`--bg-secondary`（改动后）
- **功能**：图谱、设置等全局导航

### 3. Left Sidebar Content（左侧边栏内容区）

- **位置**：Left Rail 右侧，Title Bar Row 下方
- **背景色**：`--bg-secondary`（改动后）
- **功能**：笔记树、文件浏览

## 背景色（改动后）

| 区域                      | CSS Token        | Light   | Dark    |
| ------------------------- | ---------------- | ------- | ------- |
| 红绿灯区域（不在 DOM 中） | 系统色           | -       | -       |
| Left Rail                 | `--bg-secondary` | #f8f9fa | #16162a |
| Left Sidebar Header       | `--bg-secondary` | #f8f9fa | #16162a |
| Left Sidebar Content      | `--bg-secondary` | #f8f9fa | #16162a |

**状态**：✓ 所有区域统一为 `--bg-secondary`

## 相关文件

- `apps/render/src/components/Layout.tsx` - 主布局组件
- `apps/render/src/components/left-rail/LeftRail.tsx` - 左侧导航组件
- `apps/render/src/components/explorer/VaultTree.tsx` - 左侧边栏内容
- `apps/client/src/main/window/manager.ts` - Electron 窗口配置（`titleBarStyle: 'hidden'`）

## 设计决策

- 使用 `titleBarStyle: 'hidden'` 隐藏原生窗口标题栏
- Left Sidebar Header 使用 `pl-12` (48px) 留出红绿灯空间
- Left Rail 宽度为 48px，与红绿灯区域下方空间对齐
