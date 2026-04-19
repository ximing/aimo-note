## 目录说明

`src/components` 只存放跨页面复用的组件。
这里的组件应该偏通用、可组合、可复用，不承载某个页面独有的状态编排。

如果一个组件只给单个页面使用，优先放到对应页面目录下的 `components/`，不要过早提升到这里。

## 适用场景

- 被 2 个及以上页面复用的通用 UI 组件
- 编辑器、资源树、命令面板这类可被多个页面嵌入的功能组件
- 只关心输入和输出、可以通过 props 复用的视图组件
- 少量依赖全局 Service 的共享组件

## 当前目录分层

### `common/`

放与具体业务弱相关的通用交互组件，例如命令面板、上下文菜单、状态栏（StatusBar）。

### `editor/`

放编辑器相关的共享组件，例如编辑器容器、状态栏、编辑器内部封装。

### `left-sidebar/`

放笔记树、快速切换、树节点等资源浏览相关的共享组件。

**CSS 命名规范**：使用 `.left-sidebar-*` 前缀，示例：
- `.left-sidebar` - 左侧边栏容器
- `.left-sidebar-header` - 侧边栏头部
- `.left-sidebar-content` - 侧边栏内容区

## 推荐写法

### 1. 优先保持 props 驱动

共享组件优先通过 props 接收数据和回调，降低对页面实现的耦合。

```typescript
interface NoteListProps {
  items: Array<{ id: string; title: string }>;
  onSelect: (id: string) => void;
}

export function NoteList({ items, onSelect }: NoteListProps) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} onClick={() => onSelect(item.id)}>
          {item.title}
        </li>
      ))}
    </ul>
  );
}
```

### 2. 读取响应式状态时再使用 `observer()`

只有组件直接读取 RSJS 可观察状态时，才使用 `observer()` 包裹。
如果只是纯 props 渲染，保持普通函数组件即可。

```typescript
import { observer, useService } from '@rabjs/react';
import { UIService } from '@/services/ui.service';

export const SidebarToggle = observer(() => {
  const uiService = useService(UIService);
  return <button onClick={() => uiService.toggleSidebar()}>Toggle</button>;
});
```

### 3. 共享组件只依赖全局 Service

放在 `src/components` 的组件如果需要直接访问 Service，优先只依赖 `src/services` 下的全局 Service。
如果组件必须依赖某个页面私有 Service，通常说明它应该留在该页面目录内，而不是提升到这里。

## 导出约定

- 每个子目录通过自己的 `index.ts` 统一导出
- 新增共享组件时，同步更新对应目录的 `index.ts`
- 组件文件名使用 PascalCase，与导出名保持一致

## 约束

- 不要把单页面私有组件放到 `src/components`
- 不要在共享组件里堆积页面编排逻辑
- 不要为了”以后可能复用”提前抽离组件
- 共享组件的输入输出优先稳定在 props，而不是隐式依赖外部上下文
- 只有组件真的被多个页面复用时，才提升到这里
- **禁止使用 `window.alert()`、`window.prompt()`、`window.confirm()`** —— 使用 `@/components/common` 下的 `PromptDialog` 或 `ConfirmDialog` 组件代替

## 新增组件时的默认约定

- 先判断组件是否真的跨页面复用
- 能通过 props 表达的数据和行为，优先不用 Service
- 需要响应式订阅时再用 `observer()`
- 新增文件后补充对应目录的 `index.ts` 导出
- 若后续只剩单页面使用，考虑下沉回页面目录
