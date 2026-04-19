# 图片粘贴存储功能设计

## 概述

支持在编辑器中复制粘贴图片，根据 vault 配置将图片存储到本地文件夹或 S3。

## 核心交互

1. 用户在编辑器中粘贴图片
2. 系统读取当前 vault 的 `.aimo-note/config.json` 获取存储配置
3. 图片按配置存储到指定位置
4. 返回 URL 并插入编辑器

## Vault 配置

位置：`.aimo-note/config.json`

```json
{
  "imageStorage": {
    "type": "local" | "s3",
    "local": {
      "path": "assets/images"
    },
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

| 字段 | 类型 | 说明 |
|------|------|------|
| type | string | `local` 或 `s3` |
| local.path | string | 本地存储路径，默认 `assets/images` |
| s3.accessKey | string | AWS Access Key |
| s3.secretKey | string | AWS Secret Key |
| s3.bucket | string | S3 Bucket 名称 |
| s3.region | string | AWS Region |
| s3.endpoint | string | 可选，自定义 endpoint |
| s3.keyPrefix | string | S3 key 前缀，按年月组织，默认空 |

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

### 新增服务

**ImageStorageService** (`apps/render/src/services/image-storage.service.ts`)

```
ImageStorageService
├── upload(file: File): Promise<string>  // 返回 URL
├── getStorageType(): 'local' | 's3'
├── loadConfig(): Promise<ImageStorageConfig>
└── saveConfig(config: ImageStorageConfig): Promise<void>
```

### IPC 新增通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `image-storage:upload-local` | renderer → main | 上传图片到本地 |
| `image-storage:upload-s3` | renderer → main | 上传图片到 S3 |
| `image-storage:get-config` | renderer → main | 获取 vault 存储配置 |
| `image-storage:set-config` | renderer → main | 保存 vault 存储配置 |

### Main Process 实现

- `image-storage-local.handler.ts` — 处理本地文件写入
- `image-storage-s3.handler.ts` — 处理 S3 上传（使用 AWS SDK）

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
| S3 上传超时/失败 | 显示 toast 错误提示，图片不插入 |
| 本地写入失败 | 显示 toast 错误提示，图片不插入 |
| 配置缺失 | 降级到默认本地配置 |
| 未选择 vault | 提示选择 vault |

## 待定项

- [ ] S3 SDK 依赖确认（`@aws-sdk/client-s3`)
- [ ] 本地文件写入路径安全性校验（防止路径遍历）
