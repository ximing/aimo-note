# Pages Directory

## 目录说明

页面目录存放业务页面。每个页面优先采用分形结构：页面自己的状态、组件、类型、工具尽量收敛在页面目录内。

## 页面加载的基本用法

页面级状态使用页面自己的 Service，并通过 `bindServices()` 绑定到页面生命周期。
这类 Service 会在页面挂载时创建，在页面卸载时销毁。

### 推荐结构

```text
{page}/
├── index.tsx              # 页面入口
├── {page}.service.ts      # 页面级 Service
├── types.ts               # 页面类型
├── index.module.scss      # 页面样式
├── components/            # 页面私有组件
├── utils/                 # 页面私有工具
└── assets/                # 页面资源
```

### 1. 定义页面 Service

页面 Service 继承 `Service`，只管理当前页面自己的状态和行为。

```typescript
import { Service } from '@rabjs/react';
import { VaultService } from '@/services/vault.service';

export class EditorPageService extends Service {
  content = '';

  get vaultService() {
    return this.resolve(VaultService);
  }

  async loadNote(path: string) {
    this.content = `loading ${path}`;
  }
}
```

### 2. 在页面入口绑定 Service

页面组件使用 `bindServices()` 注册页面 Service。
页面内容建议写成 `observer()` 组件，并在内部通过 `useService()` 获取实例。

```typescript
import { bindServices, observer, useService } from '@rabjs/react';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { EditorPageService } from './editor-page.service';

const EditorPageContent = observer(() => {
  const service = useService(EditorPageService);
  const { path = '' } = useParams();

  useEffect(() => {
    service.loadNote(path);
  }, [path, service]);

  return <div>{service.content}</div>;
});

export default bindServices(EditorPageContent, [EditorPageService]);
```

### 3. 页面子组件直接复用页面 Service

只要子组件在该页面组件树内，就可以直接 `useService(EditorPageService)`，不需要层层 props 传递。

```typescript
import { observer, useService } from '@rabjs/react';
import { EditorPageService } from '../editor-page.service';

export const EditorHeader = observer(() => {
  const service = useService(EditorPageService);
  return <header>{service.content}</header>;
});
```

## 页面和全局 Service 的关系

- 页面 Service 负责当前页面状态
- 全局 Service 负责跨页面共享能力
- 页面 Service 可以通过 `resolve()` 访问全局 Service
- 页面组件和页面子组件优先访问页面 Service，不直接堆积全局状态

## 约束

- 仅当组件、工具、类型被 2+ 页面共享时，才放到 `src/components`、`src/utils`、`src/types`
- 页面内通常只有一个主 Service，复杂时再按子领域拆分
- 单个 Service 超过 1200 行再考虑拆分
- 页面私有状态不要放到 `src/services`
- 页面入口优先使用 `bindServices()`，不要在页面内手动 new Service

## 新增页面时的默认约定

- 先创建页面目录，再放 `index.tsx` 和 `{page}.service.ts`
- 页面请求、派生状态、交互逻辑优先写进页面 Service
- 页面内局部组件如需共享页面状态，直接 `useService(页面 Service)`
- 只有真正跨页面复用的能力才上移到全局 `src/services`
