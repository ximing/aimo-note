## 目录说明

`src/services` 只存放全局 Service。
这里的 Service 是应用级单例，适合被多个页面、多个组件复用。

## 适用场景

- 跨页面共享状态，如当前 vault、主题、搜索索引、编辑器全局状态
- 需要长期存在的能力，如 IPC 封装、插件管理、全局 UI 状态
- 会被页面 Service 或通用组件反复依赖的基础能力

## 全局加载的基本用法

### 1. 定义全局 Service

全局 Service 继承 `Service`，只负责应用级状态和动作。

```typescript
import { Service } from '@rabjs/react';

export class VaultService extends Service {
  vaultPath = '';

  async openVault(path: string) {
    this.vaultPath = path;
  }
}
```

### 2. 在应用启动时注册

全局 Service 使用 `register()`，统一在 `src/main.tsx` 或应用启动入口注册。

```typescript
import { register } from '@rabjs/react';
import { VaultService } from './services/vault.service';
import { UIService } from './services/ui.service';

register(VaultService);
register(UIService);
```

### 3. 在组件中使用

组件内通过 `useService()` 读取全局 Service。
组件本身要放在 `observer()` 或 `bindServices()` 包裹的响应式上下文里。

```typescript
import { observer, useService } from '@rabjs/react';
import { VaultService } from '@/services/vault.service';

const VaultIndicator = observer(() => {
  const vaultService = useService(VaultService);
  return <span>{vaultService.vaultPath || 'No Vault'}</span>;
});
```

### 4. 在其他 Service 中依赖全局 Service

Service 内部通过 `this.resolve()` 获取全局依赖。

```typescript
import { Service } from '@rabjs/react';
import { VaultService } from '@/services/vault.service';

export class SearchPageService extends Service {
  get vaultService() {
    return this.resolve(VaultService);
  }

  async load() {
    const path = this.vaultService.vaultPath;
    console.log(path);
  }
}
```

## 约束

- 全局 Service 只放多页面复用的能力
- 全局 Service 使用 `register()` 注册，不使用 `bindServices()`
- 不要把只服务单一页面的状态放到这里
- 不要在组件里直接 new Service，统一走 RSJS 注册和解析
- 优先让页面 Service 依赖全局 Service，而不是让页面之间互相依赖

## 推荐模式

- `src/services`：应用级单例 Service
- `src/pages/*/*.service.ts`：页面级 Service
- 页面 Service 可以 `resolve()` 全局 Service
- 全局 Service 不感知具体页面实现

## 新增代码时的默认约定

- 新增跨页面能力，优先放到 `src/services`
- 新增页面私有状态，放到对应页面目录
- 如果一个 Service 将来会被 2 个及以上页面复用，再考虑上移到这里
