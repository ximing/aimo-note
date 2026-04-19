# 图片粘贴存储功能设计

## 概述

支持在编辑器中复制粘贴图片，根据 vault 配置将图片存储到本地文件夹或 S3。

## 核心交互

1. 用户在编辑器中粘贴图片
2. 系统读取当前 vault 的 `.aimo-note/config.json` 获取存储配置
3. 图片按配置存储到指定位置
4. 返回 URL 并插入编辑器

## Vault 配置

位置：`.aimo-note/config.json`（与现有 vault 配置合并）

```typescript
type ImageStorageConfig =
  | { type: 'local'; local: { path: string } }
  | { type: 's3'; s3: S3Config };

type S3Config = {
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  endpoint: string;       // 可选，自定义 endpoint
  keyPrefix: string;      // 可选，默认空
};
```

**配置示例（type=local）**:
```json
{
  "imageStorage": {
    "type": "local",
    "local": { "path": "assets/images" }
  }
}
```

**配置示例（type=s3）**:
```json
{
  "imageStorage": {
    "type": "s3",
    "s3": {
      "accessKey": "xxx",
      "secretKey": "xxx",
      "bucket": "my-bucket",
      "region": "us-east-1",
      "endpoint": "",
      "keyPrefix": "2026/04/"
    }
  }
}
```

## 存储规则

### 本地存储

- 路径：`{vaultRoot}/{local.path}/{uuid}.{ext}`
- 示例：`/vault/assets/images/a1b2c3d4-e5f6-7890.png`
- 文件名：纯 UUID.v4 + 原文件扩展名

### S3 存储

- Key 格式：`{keyPrefix}{uuid}.{ext}`
- 示例：`2026/04/a1b2c3d4-e5f6-7890.png`
- 上传失败时显示错误 toast，图片不插入编辑器

## 文件命名

- 策略：纯 UUID（完全匿名化）
- 扩展名：保留原文件扩展名（png/jpg/gif/webp/svg 等）

## 架构设计

### 图片数据传输流程

由于 Electron 安全限制，renderer 无法直接访问剪贴板中的 File 对象。流程如下：

```
用户粘贴
    │
    ▼
Milkdown 捕获 paste 事件
    │
    ▼
IPC: clipboard:read-image → main process
    │
    ▼
main process 从剪贴板读取图片数据（返回 ArrayBuffer）
    │
    ▼
ImageStorageService.upload(arrayBuffer, mimeType)
    │
    ├─ [local] 生成 UUID，构建路径，写入文件
    │              └─ IPC: image-storage:upload
    │
    └─ [s3]    生成 UUID，构建 key，上传 S3
                   └─ IPC: image-storage:upload
    │
    ▼
返回 URL
    │
    ▼
Milkdown 插入图片 markdown
```

### 返回 URL 格式

| 存储类型 | URL 格式 | 示例 |
|----------|----------|------|
| local | 相对路径（相对于 vault 根目录） | `assets/images/a1b2c3d4.png` |
| s3 | 完整 S3 URL | `https://bucket.s3.region.amazonaws.com/2026/04/a1b2c3d4.png` |

> Milkdown 使用相对路径时，会基于 vault 根目录解析；S3 URL 直接作为 img src。

### 新增服务

**ImageStorageService** (`apps/render/src/services/image-storage.service.ts`)

```typescript
import { Service } from '@rabjs/react';

export class ImageStorageService extends Service {
  async upload(
    arrayBuffer: ArrayBuffer,
    mimeType: string
  ): Promise<string> {
    // 1. 读取 vault 配置
    // 2. 根据类型路由到 local 或 s3 处理
    // 3. 返回 URL
  }

  async loadConfig(): Promise<ImageStorageConfig> { /* ... */ }
  async saveConfig(config: ImageStorageConfig): Promise<void> { /* ... */ }
}

export function useImageStorageService(): ImageStorageService {
  return resolve(ImageStorageService);
}
```

### IPC 新增通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `clipboard:read-image` | renderer → main | 从剪贴板读取图片，返回 `{ arrayBuffer: ArrayBuffer, mimeType: string }` |
| `image-storage:upload` | renderer → main | 上传图片（根据 vault 配置自动路由到 local 或 s3） |
| `image-storage:get-config` | renderer → main | 获取当前 vault 的 imageStorage 配置 |
| `image-storage:set-config` | renderer → main | 保存 imageStorage 配置到当前 vault |

### Preload API

```typescript
window.electronAPI.clipboard.readImage(): Promise<{
  arrayBuffer: ArrayBuffer;
  mimeType: string;
}>;

window.electronAPI.imageStorage.upload(data: {
  arrayBuffer: ArrayBuffer;
  mimeType: string;
}): Promise<string>;  // 返回 URL

window.electronAPI.imageStorage.getConfig(): Promise<ImageStorageConfig>;
window.electronAPI.imageStorage.setConfig(config: ImageStorageConfig): Promise<void>;
```

### Main Process 实现

- `image-storage.handler.ts` — 统一处理 local/s3 上传，根据 vault 配置路由
- 本地写入：使用 Node.js `fs/promises`，路径拼接后写入 vault 目录
- S3 上传：使用 `@aws-sdk/client-s3`

### 路径安全性校验

本地写入时必须校验：
1. `local.path` 不包含 `../`（防止路径遍历）
2. 最终路径必须在 `vaultRoot` 内
3. UUID 保证文件名唯一性

## 设置 UI

在现有设置页面 (`apps/render/src/pages/settings/index.tsx`) 中增加"图片存储"区块：

```
图片存储
├── 存储方式
│   ├── ○ 本地 (默认)
│   └── ○ S3
├── ───────────── (分隔，本地配置)
├── 本地路径
│   └── [assets/images]
├── ───────────── (分隔，S3配置，仅 S3 模式显示)
├── Access Key
│   └── [输入框]
├── Secret Key
│   └── [输入框]
├── Bucket
│   └── [输入框]
├── Region
│   └── [输入框]
├── Endpoint (可选)
│   └── [输入框]
└── Key 前缀
    └── [2026/04/]
```

## 错误处理

| 场景 | 处理 |
|------|------|
| 剪贴板无图片 | 静默忽略，正常粘贴文本 |
| 不支持的图片格式 | 显示 toast 错误提示 |
| S3 认证失败 | 显示 toast 错误提示（区分于网络错误） |
| S3 上传超时/失败 | 显示 toast 错误提示，图片不插入 |
| 本地写入失败（权限/磁盘空间） | 显示 toast 错误提示，图片不插入 |
| 配置缺失 | 降级到默认本地配置 `{ type: 'local', local: { path: 'assets/images' } }` |
| 未选择 vault | 提示选择 vault |
| UUID 冲突 | 理论上不可能（UUIDv4 唯一性），不处理 |

## 待定项

- [ ] S3 SDK 依赖确认（`@aws-sdk/client-s3`，需评估 bundle size）
- [ ] 路径遍历校验（实现时需在 main process 校验）
- [ ] Milkdown paste 事件拦截与 IPC 调用衔接
- [ ] 设置 UI 中 S3 配置的展示/隐藏逻辑
