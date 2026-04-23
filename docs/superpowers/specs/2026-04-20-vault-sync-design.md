# Vault 同步方案设计（服务端协调版）

## 背景

AIMO-Note 需要一个长期稳定、支持多设备同步、历史回溯、冲突保留与手动合并的本地优先同步方案。

纯 S3 对象协调方案在 2-3 台设备时可以勉强工作，但长期会遇到以下问题：

- 共享 `manifest.json` / `changelog.json` 容易形成热点对象
- `sync.lock` 在对象存储上的并发语义脆弱
- 冲突只能基于 hash 粗粒度判断，缺少明确的 `baseRevision`
- 后续接入账号、设备管理、审计、分享时扩展成本高

因此本方案调整为：

> **客户端继续本地优先，服务端成为同步协议的权威协调层，S3 兼容存储继续作为低成本 Blob 仓库。**

并且本次补充约束如下：

- 服务端代码位于 `apps/server`
- 服务端技术栈参考 `console/apps/server`
- 服务端架构：`Express + routing-controllers + TypeScript + TypeDI`
- 数据库：MySQL
- 必须具备账号系统
- 数据隔离按 **用户（User）** 维度进行

---

## 目标与边界

### 核心目标

1. **本地优先**：离线可编辑，本地文件与本地索引始终可用。
2. **多设备同步**：2-3 台设备稳定同步，设备可短时离线。
3. **可选同步**：同步是用户主动开启的增强能力；不开启同步时，应用仍可完整本地使用。
4. **账号体系**：用户可以注册、登录、持有多个 vault；只有在需要开启同步时才必须登录。
5. **用户级隔离**：任何同步数据、Blob 引用、设备状态都必须属于某个用户。
6. **版本回溯**：任意文件可恢复到历史 revision，恢复行为本身形成新 revision。
7. **冲突保留**：发生并发修改时保留双版本，用户手动合并。
8. **成本可控**：只传增量，内容去重，Blob 落对象存储。
9. **架构可扩展**：后续可扩展分享、团队空间、服务端搜索、Web 端查看。

### 当前边界

- **同步数据**：vault 内除 `.aimo-note/**` 外的所有文件
- **设备规模**：2-3 台设备，单用户为主
- **同步开关**：同步默认关闭，由用户在设置页主动开启；未开启时应用保持纯本地模式
- **协作模型**：非实时协同，不做多人实时共编
- **权限模型**：本期先以 vault owner = user 为主；分享 / 多成员模型保留扩展位
- **远端存储**：MySQL 存元数据，S3 兼容存储存 Blob / snapshot
- **客户端元数据**：SQLite 负责本地 revision、同步队列、冲突、缓存

### 暂不纳入本期

- CRDT / OT 字符级实时协作
- `.aimo-note/**` 目录内容同步
- 团队空间 ACL 细粒度权限
- 服务端直接托管客户端全文索引

---

## 技术栈与实现基线

### 服务端技术选型

服务端目录为 `apps/server`，实现基线参考 `console/apps/server`：

- `express`
- `routing-controllers`
- `typedi`
- `reflect-metadata`
- `drizzle-orm` + `mysql2`
- `jsonwebtoken`
- `bcrypt`
- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`

### 服务端分层原则

```text
controllers  ->  services  ->  db/schema + infra
                 ^
                 |
             typedi IOC
```

- `controllers`：只做 HTTP 参数解析、认证态获取、响应包装
- `services`：实现业务逻辑与事务边界
- `db/schema`：Drizzle schema，统一定义 MySQL 表
- `middlewares`：认证、错误处理、审计上下文
- `config`：环境变量与运行配置
- `utils`：ID、hash、响应、日志等工具

### 客户端与服务端职责

| 层 | 职责 |
|---|---|
| `packages/core` | 本地 revision、blob cache、pending queue、自动同步编排、pull/apply、冲突副本 |
| `apps/client` | 文件系统、token 持久化、HTTP 通信、网络状态感知、IPC 暴露 |
| `apps/render` | 设置页登录与同步开关、同步状态、手动同步入口、冲突 UX、历史与回溯 UI |
| `apps/server` | 账号、vault、设备、commit、cursor、Blob 签名 URL、冲突判定 |
| S3 Blob Store | 文件内容 blob、快照、灾备档案 |

---

## 服务端目录规划

`apps/server` 目标目录建议如下：

```text
apps/server/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── src/
│   ├── index.ts
│   ├── app.ts
│   ├── ioc.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── config.ts
│   ├── constants/
│   │   └── error-codes.ts
│   ├── controllers/
│   │   ├── index.ts
│   │   └── v1/
│   │       ├── auth.controller.ts
│   │       ├── user.controller.ts
│   │       ├── vault.controller.ts
│   │       ├── sync.controller.ts
│   │       ├── device.controller.ts
│   │       └── snapshot.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── user.service.ts
│   │   ├── vault.service.ts
│   │   ├── device.service.ts
│   │   ├── sync-commit.service.ts
│   │   ├── sync-pull.service.ts
│   │   ├── blob.service.ts
│   │   ├── cursor.service.ts
│   │   ├── conflict.service.ts
│   │   ├── snapshot.service.ts
│   │   └── audit.service.ts
│   ├── db/
│   │   ├── connection.ts
│   │   ├── migrate.ts
│   │   ├── transaction.ts
│   │   └── schema/
│   │       ├── users.ts
│   │       ├── vaults.ts
│   │       ├── vault-members.ts
│   │       ├── devices.ts
│   │       ├── blobs.ts
│   │       ├── sync-commits.ts
│   │       ├── sync-commit-changes.ts
│   │       ├── sync-file-heads.ts
│   │       ├── sync-device-cursors.ts
│   │       ├── sync-conflicts.ts
│   │       ├── auth-sessions.ts
│   │       └── index.ts
│   ├── middlewares/
│   │   ├── auth-handler.ts
│   │   ├── request-context.ts
│   │   └── error-handler.ts
│   ├── utils/
│   │   ├── id.ts
│   │   ├── response.ts
│   │   ├── logger.ts
│   │   └── sha.ts
│   └── types/
│       ├── express.ts
│       └── response.ts
└── drizzle/
```

### 目录说明

- `auth.controller.ts`：注册 / 登录 / 登出 / 当前用户
- `vault.controller.ts`：创建 vault、查询 vault 列表、获取 vault 配置
- `sync.controller.ts`：`has-blobs`、`blob-upload-url`、`commit`、`pull`、`ack`
- `device.controller.ts`：设备注册、设备列表、设备吊销
- `snapshot.controller.ts`：快照列表、恢复触发、状态查看

---

## 账号系统设计

### 认证模型

本期使用最简单稳定的账号模型：

- 用户通过邮箱 + 密码注册
- 登录后签发 JWT
- JWT 可放在：
  - HTTP-only cookie（Web / Browser 端）
  - `Authorization: Bearer <token>`（桌面客户端）
- 桌面端同步接口优先用 Bearer Token

### 推荐 Token 策略

#### 方案 A：单 JWT（首期可接受）

- 登录返回 access token
- 有效期 30-90 天
- 服务端中间件解析 token，并注入 `request.user`

#### 方案 B：access + refresh（更推荐）

- `access token`：短期（1-7 天）
- `refresh token`：长期（30-90 天），落 `auth_sessions`
- 支持单设备踢出与主动注销

本期如果要快速交付，可先使用 **方案 A**，但数据库与服务层应预留升级到 **方案 B** 的能力。

### 用户 API

| API | 说明 | 是否需要登录 |
|---|---|---|
| `POST /api/v1/auth/register` | 注册 | 否 |
| `POST /api/v1/auth/login` | 登录 | 否 |
| `POST /api/v1/auth/logout` | 登出 | 是 |
| `GET /api/v1/auth/me` | 当前用户 | 是 |
| `GET /api/v1/user/profile` | 用户资料 | 是 |

### 登录与同步开启规则

- 登录入口位于设置页；用户只有在准备开启同步时才需要登录。
- 未登录或未开启同步时，应用仍应正常提供本地编辑、搜索、索引与历史能力。
- 用户在设置页显式开启同步后，客户端才启动后台同步引擎、设备注册与远端协议交互。
- 关闭同步或退出登录不会影响本地 vault 的读写；只会让同步引擎回到 `DISABLED` 状态，并保留待同步队列以便后续恢复。
- 未开启同步或处于离线时，客户端仍需在本地记录 pending change、历史、冲突副本与运行时诊断信息，供后续恢复、同步与排查使用；这些本地记录仅代表当前设备视角，不能替代服务端作为同步事实与冲突摘要的唯一真相源。
- 设置页需要提供当前账号信息、同步开关、最近同步状态，以及“立即同步”按钮。

### 离线与自动同步原则

- 用户不需要自己理解或手动执行 `push` / `pull`；正常路径由系统自动完成。
- 自动同步至少在以下时机触发：开启同步后首次启动、登录成功、设备重新联网、本地产生 pending change、后台周期性轮询。
- 设置页中的“立即同步”是兜底手动入口，用于用户希望立刻触发一次同步，而不是日常必经步骤。
- 断网、服务端暂时不可达、DNS 失败等网络问题不能阻塞本地编辑；客户端应进入 `OFFLINE` 状态并保留所有 pending change。
- 网络恢复后，客户端应自动重试未完成的同步流程，并在成功后推进本地 cursor 与同步状态。

---

## 用户隔离模型

### 隔离原则

所有同步相关数据必须满足以下之一：

1. 直接带 `user_id`
2. 带 `vault_id`，并且 `vault_id` 可唯一追溯到 `owner_user_id`

### 本期推荐隔离模型

#### 核心规则

- `vaults.owner_user_id` 是第一层隔离边界
- 任何同步请求都必须先校验：当前登录用户是否拥有该 `vault_id`
- 设备、cursor、commit、conflict、snapshot 等记录都通过 `vault_id` 归属到某个用户
- Blob 对象 key 也必须包含 `userId` 或 `vaultId`，避免跨用户误引用

### 服务层强制约束

每个 service 方法都必须显式接收：

- `currentUserId`
- `vaultId`

禁止只凭 `vaultId` 直接查写核心同步表，而不做 owner 校验。

### 推荐校验方式

在 service 层统一先做：

```text
assertVaultOwnership(currentUserId, vaultId)
```

然后再执行：

- has-blobs
- commit
- pull
- ack
- list devices
- create snapshot

### 为什么按 User 隔离，而不是按 Device 隔离

因为设备只是用户的一个执行终端；真正的数据拥有者是用户。设备状态应该附着在用户的 vault 之下，而不是成为一级租户。

---

## 远端数据模型（MySQL）

### 1. 用户与会话

```sql
CREATE TABLE users (
  id VARCHAR(191) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL,
  avatar VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);

CREATE TABLE auth_sessions (
  id VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  device_name VARCHAR(100) NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_auth_sessions_user_id (user_id)
);
```

### 2. Vault 与成员

```sql
CREATE TABLE vaults (
  id VARCHAR(191) PRIMARY KEY,
  owner_user_id VARCHAR(191) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_vaults_owner_user_id (owner_user_id)
);

CREATE TABLE vault_members (
  id VARCHAR(191) PRIMARY KEY,
  vault_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  role VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_vault_user (vault_id, user_id),
  INDEX idx_vault_members_user_id (user_id)
);
```

> 本期即使只支持 owner，也建议保留 `vault_members`，避免未来分享能力重构核心表。

### 3. 设备

```sql
CREATE TABLE devices (
  id VARCHAR(191) PRIMARY KEY,
  vault_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  name VARCHAR(100) NOT NULL,
  platform VARCHAR(50) NULL,
  client_version VARCHAR(50) NULL,
  last_seen_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_devices_vault_id (vault_id),
  INDEX idx_devices_user_id (user_id)
);
```

### 4. Blob 元数据

```sql
CREATE TABLE blobs (
  id VARCHAR(191) PRIMARY KEY,
  vault_id VARCHAR(191) NOT NULL,
  blob_hash VARCHAR(191) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(100) NULL,
  ref_count INT NOT NULL DEFAULT 0,
  created_by_user_id VARCHAR(191) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_blobs_vault_hash (vault_id, blob_hash),
  INDEX idx_blobs_vault_id (vault_id)
);
```

### 5. Commit 日志与文件 Head

```sql
CREATE TABLE sync_commits (
  seq BIGINT PRIMARY KEY AUTO_INCREMENT,
  id VARCHAR(191) NOT NULL UNIQUE,
  vault_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  device_id VARCHAR(191) NOT NULL,
  request_id VARCHAR(191) NOT NULL,
  base_seq BIGINT NOT NULL,
  change_count INT NOT NULL,
  summary VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_sync_commits_request (vault_id, request_id),
  INDEX idx_sync_commits_vault_seq (vault_id, seq)
);

CREATE TABLE sync_commit_changes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  commit_seq BIGINT NOT NULL,
  vault_id VARCHAR(191) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  op VARCHAR(32) NOT NULL,
  blob_hash VARCHAR(191) NULL,
  base_revision VARCHAR(191) NULL,
  new_revision VARCHAR(191) NOT NULL,
  size_bytes BIGINT NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_sync_commit_changes_commit_seq (commit_seq),
  INDEX idx_sync_commit_changes_vault_path (vault_id, file_path)
);

CREATE TABLE sync_file_heads (
  id VARCHAR(191) PRIMARY KEY,
  vault_id VARCHAR(191) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  head_revision VARCHAR(191) NOT NULL,
  blob_hash VARCHAR(191) NULL,
  last_commit_seq BIGINT NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_sync_file_heads_vault_path (vault_id, file_path),
  INDEX idx_sync_file_heads_vault_id (vault_id)
);
```

### 6. 设备游标与冲突

```sql
CREATE TABLE sync_device_cursors (
  id VARCHAR(191) PRIMARY KEY,
  vault_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  device_id VARCHAR(191) NOT NULL,
  last_pulled_seq BIGINT NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_sync_device_cursors (vault_id, device_id),
  INDEX idx_sync_device_cursors_user_id (user_id)
);

CREATE TABLE sync_conflicts (
  id VARCHAR(191) PRIMARY KEY,
  vault_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  losing_device_id VARCHAR(191) NOT NULL,
  winning_revision VARCHAR(191) NOT NULL,
  losing_revision VARCHAR(191) NOT NULL,
  winning_commit_seq BIGINT NOT NULL,
  resolved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_sync_conflicts_vault_id (vault_id),
  INDEX idx_sync_conflicts_user_id (user_id)
);
```

### 7. 快照与审计

```sql
CREATE TABLE snapshots (
  id VARCHAR(191) PRIMARY KEY,
  vault_id VARCHAR(191) NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  status VARCHAR(32) NOT NULL,
  base_seq BIGINT NOT NULL,
  size_bytes BIGINT NULL,
  restored_commit_seq BIGINT NULL,
  created_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3) NULL,
  INDEX idx_snapshots_vault_id (vault_id)
);

CREATE TABLE sync_audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id VARCHAR(191) NOT NULL,
  vault_id VARCHAR(191) NULL,
  device_id VARCHAR(191) NULL,
  action VARCHAR(64) NOT NULL,
  request_id VARCHAR(191) NULL,
  status VARCHAR(32) NOT NULL,
  detail_json JSON NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_sync_audit_logs_user_id (user_id),
  INDEX idx_sync_audit_logs_vault_id (vault_id)
);
```

---

## Blob 存储布局

### 对象 Key 组织

必须把用户 / vault 维度放入 key，避免跨用户误复用：

```text
users/{userId}/vaults/{vaultId}/
  blobs/sha256/ab/cd/{fullHash}
  snapshots/2026-04-21/{snapshotId}.tar.gz
```

### 设计原则

- 先按 `vaultId + blobHash` 做逻辑去重
- 物理 key 也落在该 vault 空间下
- 不做跨用户全局 blob dedupe，降低隔离复杂度

> 即使两个用户内容完全相同，也不共享同一个物理 blob key。这样隔离最简单，权限最安全。

---

## 同步协议

## 核心 API

### 认证与基础

| API | 方法 | 说明 | 认证 |
|---|---|---|---|
| `/api/v1/auth/register` | POST | 用户注册 | 否 |
| `/api/v1/auth/login` | POST | 用户登录 | 否 |
| `/api/v1/auth/logout` | POST | 用户登出 | 是 |
| `/api/v1/auth/me` | GET | 当前用户 | 是 |
| `/api/v1/vaults` | GET | vault 列表 | 是 |
| `/api/v1/vaults` | POST | 创建 vault | 是 |

### 设备与同步

| API | 方法 | 说明 | 认证 |
|---|---|---|---|
| `/api/v1/devices/register` | POST | 注册设备 | 是 |
| `/api/v1/devices` | GET | 查询当前用户设备 | 是 |
| `/api/v1/sync/has-blobs` | POST | 查询 blob 是否已存在 | 是 |
| `/api/v1/sync/blob-upload-url` | POST | 获取预签名上传地址 | 是 |
| `/api/v1/sync/blob-download-url` | POST | 获取 blob 下载地址 | 是 |
| `/api/v1/sync/commit` | POST | 提交本地变更集 | 是 |
| `/api/v1/sync/pull` | GET | 按游标拉取增量提交 | 是 |
| `/api/v1/sync/ack` | POST | 推进设备 cursor | 是 |
| `/api/v1/sync/conflicts` | GET | 查询冲突摘要 | 是 |
| `/api/v1/sync/history/blob` | GET | 获取历史 revision 对应 blob 引用 | 是 |
| `/api/v1/sync/diagnostics` | GET | 查询同步诊断摘要 | 是 |
| `/api/v1/sync/diagnostics/events` | POST | 上报同步 runtime event | 是 |
| `/api/v1/snapshots` | GET | 快照列表 | 是 |
| `/api/v1/snapshots` | POST | 创建快照 | 是 |
| `/api/v1/snapshots/:id` | GET | 查询快照或 restore 任务状态 | 是 |
| `/api/v1/snapshots/:id/restore` | POST | 触发恢复 | 是 |

---

## HTTP Contract 细化

### 统一响应格式

服务端建议统一复用 `console/apps/server` 的 `ResponseUtil` 形态：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {}
}
```

- `code = 0` 表示成功
- 业务失败通过 `code` + `msg` 表达
- HTTP status 用于表达认证、权限、资源、并发语义
- `routing-controllers` controller 只返回 DTO，不手写散落的响应结构

### 通用请求头

除注册 / 登录外，所有接口都要求：

- `Authorization: Bearer <token>` 或 cookie 中存在登录态
- `X-Request-Id: <uuid>`，用于审计与幂等追踪
- `X-Device-Id: <deviceId>`，桌面端同步请求建议显式传递

### 1. `POST /api/v1/auth/register`

**Request**

```json
{
  "email": "alice@example.com",
  "username": "alice",
  "password": "plain-password"
}
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "token": "jwt-token",
    "user": {
      "id": "usr_123",
      "email": "alice@example.com",
      "username": "alice"
    }
  }
}
```

### 2. `POST /api/v1/auth/login`

**Request**

```json
{
  "email": "alice@example.com",
  "password": "plain-password"
}
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "token": "jwt-token",
    "user": {
      "id": "usr_123",
      "email": "alice@example.com",
      "username": "alice"
    }
  }
}
```

### 3. `POST /api/v1/vaults`

**Request**

```json
{
  "name": "My Vault",
  "description": "personal notes"
}
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "id": "vlt_123",
    "name": "My Vault",
    "ownerUserId": "usr_123",
    "createdAt": "2026-04-21T10:00:00.000Z"
  }
}
```

### 4. `POST /api/v1/devices/register`

**Request**

```json
{
  "vaultId": "vlt_123",
  "deviceId": "dev_macbook",
  "name": "Ximing MacBook Pro",
  "platform": "macOS",
  "clientVersion": "0.9.5"
}
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "deviceId": "dev_macbook",
    "vaultId": "vlt_123",
    "registered": true,
    "lastSeenAt": "2026-04-21T10:00:00.000Z"
  }
}
```

### 5. `POST /api/v1/sync/has-blobs`

**Request**

```json
{
  "vaultId": "vlt_123",
  "blobHashes": [
    "sha256:aaa",
    "sha256:bbb"
  ]
}
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "existing": ["sha256:aaa"],
    "missing": ["sha256:bbb"]
  }
}
```

### 6. `POST /api/v1/sync/blob-upload-url`

**Request**

```json
{
  "vaultId": "vlt_123",
  "blobHash": "sha256:bbb",
  "sizeBytes": 2048,
  "mimeType": "application/octet-stream"
}
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "blobHash": "sha256:bbb",
    "storageKey": "users/usr_123/vaults/vlt_123/blobs/sha256/bb/bb/sha256_bbb",
    "uploadUrl": "https://example-s3-presigned-url",
    "headers": {
      "Content-Type": "application/octet-stream"
    },
    "expiresIn": 3600
  }
}
```

### 6.1 `POST /api/v1/sync/blob-download-url`

**Request**

```json
{
  "vaultId": "vlt_123",
  "blobHash": "sha256:bbb"
}
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "blobHash": "sha256:bbb",
    "storageKey": "users/usr_123/vaults/vlt_123/blobs/sha256/bb/bb/sha256_bbb",
    "downloadUrl": "https://example-s3-presigned-download-url",
    "expiresIn": 3600
  }
}
```

> `pull` / `history/blob` 只负责返回当前用户可见的 blob 引用；当客户端确实需要读取内容时，再调用 `blob-download-url` 换取短时可用的下载地址。

### 7. `POST /api/v1/sync/commit`

**Request**

```json
{
  "vaultId": "vlt_123",
  "deviceId": "dev_macbook",
  "requestId": "req_123",
  "baseSeq": 128,
  "summary": "sync 2 changes",
  "changes": [
    {
      "filePath": "assets/today.png",
      "op": "upsert",
      "blobHash": "sha256:bbb",
      "baseRevision": "rev_127_today",
      "newRevision": "rev_local_today_001",
      "sizeBytes": 2048,
      "metadata": {
        "contentType": "image/png"
      }
    },
    {
      "filePath": "docs/old.txt",
      "op": "delete",
      "blobHash": null,
      "baseRevision": "rev_120_old",
      "newRevision": "rev_local_old_delete_001",
      "sizeBytes": null,
      "metadata": null
    }
  ]
}
```

**Success Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "accepted": true,
    "commitId": "cmt_129",
    "commitSeq": 129,
    "appliedChanges": [
      {
        "filePath": "assets/today.png",
        "headRevision": "rev_srv_129_today",
        "blobHash": "sha256:bbb",
        "isDeleted": false
      },
      {
        "filePath": "docs/old.txt",
        "headRevision": "rev_srv_129_old_delete",
        "blobHash": null,
        "isDeleted": true
      }
    ]
  }
}
```

**Conflict Response**

```json
{
  "code": 40901,
  "msg": "head_mismatch",
  "data": {
    "accepted": false,
    "reason": "head_mismatch",
    "conflicts": [
      {
        "filePath": "assets/today.png",
        "expectedBaseRevision": "rev_127_today",
        "actualHeadRevision": "rev_srv_128_today",
        "remoteBlobHash": "sha256:ccc",
        "winningCommitSeq": 128
      }
    ]
  }
}
```

### 8. `GET /api/v1/sync/pull`

**Query**

```text
/v1/sync/pull?vaultId=vlt_123&sinceSeq=128&limit=200
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "vaultId": "vlt_123",
    "sinceSeq": 128,
    "latestSeq": 130,
    "hasMore": false,
    "blobRefs": [
      {
        "blobHash": "sha256:bbb",
        "sizeBytes": 2048,
        "mimeType": "image/png"
      }
    ],
    "commits": [
      {
        "commitSeq": 129,
        "commitId": "cmt_129",
        "deviceId": "dev_macbook",
        "userId": "usr_123",
        "createdAt": "2026-04-21T10:00:00.000Z",
        "changes": [
          {
            "filePath": "assets/today.png",
            "op": "upsert",
            "blobHash": "sha256:bbb",
            "newRevision": "rev_srv_129_today",
            "sizeBytes": 2048,
            "isDeleted": false
          }
        ]
      }
    ]
  }
}
```

### 9. `POST /api/v1/sync/ack`

**Request**

```json
{
  "vaultId": "vlt_123",
  "deviceId": "dev_macbook",
  "ackedSeq": 130
}
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "deviceId": "dev_macbook",
    "vaultId": "vlt_123",
    "lastPulledSeq": 130,
    "updated": true
  }
}
```

### 10. `GET /api/v1/sync/history`

**Query**

```text
/api/v1/sync/history?vaultId=vlt_123&filePath=assets/today.png&page=1&pageSize=50
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "items": [
      {
        "revision": "rev_srv_129_today",
        "blobHash": "sha256:bbb",
        "commitSeq": 129,
        "createdAt": "2026-04-21T10:00:00.000Z",
        "deviceId": "dev_macbook",
        "isDeleted": false
      }
    ],
    "page": 1,
    "pageSize": 50,
    "hasMore": false
  }
}
```

### 10.1 `GET /api/v1/sync/history/blob`

**Query**

```text
/api/v1/sync/history/blob?vaultId=vlt_123&revision=rev_srv_129_today
```

**Response**

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "revision": "rev_srv_129_today",
    "blobHash": "sha256:bbb",
    "sizeBytes": 2048,
    "mimeType": "image/png",
    "isDeleted": false
  }
}
```

### 关键约束

- `commit.changes[].newRevision` 由客户端生成，服务端只校验唯一性与语义，不强依赖服务端重写
- `commit.baseSeq` 是客户端视角的全局远端基线，用于快速判断是否需要重新 pull
- `changes[].baseRevision` 才是文件级并发冲突判定的权威字段
- `pull.limit` 必须支持分页，避免大 vault 一次返回过多数据
- `pull` 与 `history/blob` 必须返回当前用户可见的 `BlobRef`，客户端在本地无缓存时通过 `blob-download-url` 获取短期下载地址
- 新设备或本地缓存丢失后，必须仅依赖 `pull + blob-download-url` 重建当前文件内容，不依赖旧设备手工拷贝
- `ack.ackedSeq` 必须满足 `ackedSeq >= currentLastPulledSeq`

---

## 请求上下文与认证中间件

### 认证流程

参考 `console/apps/server` 的 `auth-handler.ts`：

1. 从 cookie 或 `Authorization` 头取 token
2. 校验 JWT
3. 加载 `request.user`
4. 交给 `routing-controllers currentUserChecker`

### 推荐扩展

在 `request-context.ts` 中再补充：

- `request.requestId`
- `request.authType`
- `request.currentVaultId`（可选）
- `request.deviceId`（从 header 或 body 提取后校验）

### Type 扩展

`src/types/express.ts` 需要声明：

```ts
interface AuthenticatedUser {
  id: string;
  email?: string;
  username?: string;
}

interface Request {
  user?: AuthenticatedUser;
  requestId?: string;
  deviceId?: string;
}
```

---

## 同步服务职责拆分

### `AuthService`

- 注册用户
- 登录校验
- token 签发与注销
- 可选 refresh session 管理

### `VaultService`

- 创建 vault
- 校验用户对 vault 的 owner / member 权限
- 查询当前用户可见 vault

### `DeviceService`

- 注册设备
- 刷新 `lastSeenAt`
- 吊销设备
- 查询设备列表

### `BlobService`

- `hasBlobs(vaultId, blobHashes[])`
- 生成预签名上传 URL
- 生成预签名下载 URL
- 记录 blob 元数据
- 引用计数增加 / 减少
- orphan blob 清理
- tombstone 的单次清理执行能力
- BlobService 只负责执行单次清理判定与对象 / 元数据更新；自动清理的触发、串行化、失败重试与任务状态由 `SchedulerService` 或等价调度层负责
- `blob-upload-url` 到 `commit` 之间允许存在短暂 orphan window；未被 commit 引用且超过安全窗口的对象由后续 orphan cleanup 回收，预签名 URL 过期时间可作为自然收敛边界之一

### `SyncCommitService`

- 幂等处理 `requestId`
- 校验用户对 vault 的权限
- 校验 `deviceId` 属于当前用户
- 校验 `baseRevision` 与 `sync_file_heads`
- 写入 `sync_commits` + `sync_commit_changes`
- 更新 `sync_file_heads`
- 冲突时返回 `head_mismatch`

### `SyncPullService`

- 基于 `vaultId + sinceSeq` 拉增量 commit
- 按用户权限过滤
- 返回变更所需的 blob 引用

### `CursorService`

- 推进设备 `last_pulled_seq`
- 幂等更新 ack
- 防止 cursor 回退

### `ConflictService`

- 记录冲突摘要
- 查询未解决冲突
- 支持标记 resolved（服务端摘要态）

### `SnapshotService`

- 触发创建快照
- 查询快照列表
- 触发恢复任务
- 恢复完成后生成新的 `restore commit`，使其他设备仍通过普通 `pull` 收敛
- 不允许绕过 `sync_commits` / `sync_file_heads` 直接原地改写远端状态
- restore 必须基于 `snapshot manifest` 与当前远端 head 计算差异，而不是直接把数据库状态改回去
- 对 snapshot 中存在且与当前 head 不一致的路径生成 `upsert`；对当前 head 中存在但 snapshot 中不存在的路径生成 `delete`；两边一致的路径不生成变更
- restore 的幂等边界是“同一次 restore 请求 / 同一个 restore task”，而不是“某个 snapshot 只能恢复一次”
- 相同 `snapshotId + requestId` 的重试不得重复创建 restore task；同一 restore task 若已成功生成 `restore commit`，后续重跑不得再生成第二个语义等价的 commit
- 用户在更晚时间显式再次 restore 同一 snapshot，可视为新的 restore 操作；若当时当前 head 与 snapshot 已不同，允许生成新的 restore task 与新的 `restore commit`
- 若 restore diff 为空（当前 head 已与 snapshot 状态一致），服务端仍应返回成功结果，但可不生成新的 commit；该语义必须在 DTO 与状态查询接口中稳定表达

### `AuditService`

- 记录关键动作：login、register-device、commit、pull、ack、snapshot
- 审计上下文必须贯穿 `userId`、`vaultId`、`deviceId`、`requestId`

---

## 自动同步编排

### 触发时机

客户端在同步已开启且登录态有效时，需要自动触发同步：

1. 应用启动并完成本地状态恢复之后
2. 用户刚在设置页登录并开启同步之后
3. `FileWatcher + ChangeQueue` 产生新的 pending change 之后（带去抖）
4. 网络从不可用恢复为可用之后
5. 周期性后台轮询或心跳检查时
6. 用户在设置页点击“立即同步”时

### 状态语义

建议同步状态至少覆盖：

- `DISABLED`：用户未开启同步，或已退出登录
- `IDLE`：已开启同步，且当前没有待执行同步任务
- `PENDING`：本地已有待上传 / 待拉取工作，等待调度
- `SYNCING`：正在执行一次完整同步流程
- `OFFLINE`：本地检测到断网或服务端暂时不可达，等待自动重试
- `ERROR`：出现需要用户关注的非瞬时错误（如 token 失效、权限异常）

### 行为要求

- 自动同步是默认主路径，不能要求用户日常手动点击 `push` / `pull`。
- 本地编辑完成后，变更先安全落入本地队列，再由后台异步同步，避免网络抖动影响编辑体验。
- `OFFLINE` 状态下允许继续积累本地变更；恢复联网后应优先执行增量同步而不是全量重建。
- “立即同步”可以复用同一套同步引擎，只是额外提供一个显式触发源 `manual`。

---

## 提交流程（Commit）

### 客户端提交前

1. 本地 pending changes 已写入 SQLite
2. 客户端先调用 `has-blobs`
3. 缺失 blob 再调用 `blob-upload-url`
4. 上传完成后调用 `commit`

### 服务端 `commit` 处理顺序

```text
1. 认证用户
2. 校验 vault 属于当前用户
3. 校验 device 属于当前用户且属于该 vault
4. 根据 requestId 做幂等去重
5. 开启数据库事务
6. 逐个文件读取当前 head
7. 校验 change.baseRevision 是否与当前 head 一致
8. 若有冲突，写冲突摘要并回滚事务
9. 若无冲突，写 sync_commits / sync_commit_changes
10. 更新 sync_file_heads
11. 必要时更新 blobs.ref_count
12. 提交事务，返回 commitSeq
```

### 幂等规则

- 同一个 `vaultId + requestId` 只能成功落一次 commit
- 重复请求时直接返回已有 commit 结果
- 防止客户端超时重试导致重复提交

---

## 拉取流程（Pull）

### `GET /api/v1/sync/pull?vaultId=...&sinceSeq=...`

服务端处理：

1. 认证用户
2. 校验 vault 权限
3. 校验 `sinceSeq >= 0`
4. 查询 `sync_commits where vault_id = ? and seq > sinceSeq`
5. 聚合对应 `sync_commit_changes`
6. 返回：
   - commits
   - changes
   - 需要下载的 `blobRefs`
   - 当前 latestSeq

### `ack`

- 设备在本地成功应用 pull 结果后再调用 `ack`
- 服务端更新 `sync_device_cursors.last_pulled_seq`
- 仅允许前进，不允许回退

---

## 冲突处理

### 冲突定义

当 `commit.change.baseRevision !== sync_file_heads.head_revision` 时，视为冲突。

### 服务端职责

- 拒绝本次冲突文件的直接覆盖
- 返回最新 head 信息
- 写 `sync_conflicts` 摘要
- 服务端保存的冲突事实与摘要是跨设备同步语义的唯一真相源；客户端本地记录只能作为当前设备的辅助视图与离线缓存

### 客户端职责

- 拉取远端最新版本
- 保留本地修改
- 为当前冲突文件生成同目录 conflict copy，文件名保留原扩展名
- 在本地记录用户的冲突处理过程、解决意图与辅助诊断信息，便于离线或未开启同步时稍后继续处理
- 提示用户手动合并，并由用户明确决定保留哪一版本或如何合并冲突

### 为什么冲突副本不放服务端生成

因为真正需要保留的是“本地工作副本 + 用户当前编辑上下文”，它天然属于客户端磁盘与编辑器流程，服务端只需保存冲突事实与摘要即可。

---

## 回溯流程

### 服务端职责

服务端不直接“恢复文件状态”，而是：

- 提供历史 revision 元数据查询能力
- 提供对应 blob 引用
- 接收客户端将旧内容恢复后产生的新 commit

### 客户端职责

- 选择目标 revision
- 读取本地或远端 blob 内容
- 写回本地文件
- 产生新的 pending change
- 下一次 commit 传播到所有设备
- 本阶段“历史能力”的验收目标是：客户端可查询服务端历史 revision 元数据、获取对应 blob 引用，并在本地无缓存时通过 `blob-download-url` 完成 rollback
- 本阶段不要求实现完整的当前设备离线历史镜像或独立的本地 history cache 层；相关能力可在后续 phase 作为性能 / 离线增强单独引入
- 因此 `packages/core` 中与 history 相关的抽象在本阶段可以是薄封装、IPC 代理或后续缓存扩展点；是否存在独立本地缓存实现，不作为本阶段验收前提

---

## 恢复与保留策略

### Blob 下载与设备重建

- `pull` 与 `history/blob` 只返回受当前用户权限保护的 blob 引用，不直接把其他用户的对象路径暴露给客户端
- 客户端需要读取内容时，再调用 `blob-download-url` 获取短时有效的下载地址
- 新设备首次同步、或本地 blob cache 丢失后的重建流程，必须能够仅依赖 `pull + blob-download-url` 恢复当前文件内容

### Tombstone Retention

- 删除操作形成的 tombstone 不能立即清理，必须保留一个明确的安全窗口
- tombstone 清理至少要同时满足：超过保留窗口；且所有未吊销设备的 cursor 都已经越过对应删除提交，或存在等价的安全判定
- 清理 tombstone 时不得删除仍被历史 revision、快照或当前 head 引用的 blob
- tombstone cleanup 的自动执行必须通过后台调度服务统一触发，而不是由 `BlobService` 自行定时或由零散 controller 直接调用
- 后台自动清理、补偿重试以及未来可能的管理端手动触发，必须复用同一条 canonical cleanup 路径，以保证 vault 级互斥、幂等语义、审计上下文与错误观测一致

### Snapshot Restore

- snapshot restore 必须是异步任务，并可追踪任务状态
- restore 完成后必须把恢复结果转化为新的同步事件流，让其他设备继续通过普通 `pull` 收敛
- 若未来引入基于 snapshot 的加速重建，也只能作为 bootstrap 优化，不能替代 `pull + blob-download-url` 的基础可恢复能力
- snapshot restore 的语义是让当前 vault 的远端可见文件集合收敛到该 snapshot 捕获的完整状态，而不是只把 snapshot 中已有文件重新写一遍
- restore 的作用域仅限当前 vault 下参与同步的用户内容；`.aimo-note/**` 等内部元数据目录不进入 snapshot，也不参与 restore diff
- 因此 restore 可能删除“在 snapshot 创建之后新增、且不在该 snapshot 中出现”的文件；客户端在触发前必须明确提示这是一次 vault 级状态回退，而不是非破坏性导入
- snapshot restore 的幂等边界是“同一次 restore 请求 / 同一个 restore task”，而不是“同一个 snapshot 永久唯一”
- 对同一次触发请求，若客户端因超时、断线或重试再次提交相同 `requestId`，服务端必须返回同一个 restore task 或其最终结果，不得重复创建任务
- 同一个 restore task 在后台执行过程中若因 worker 重启、调度重试或重复投递再次执行，必须复用既有执行结果；一旦已经成功生成 `restore commit`，后续重跑不得再次生成第二个语义等价的 commit
- 若 restore 计算出的差异为空（即当前 head 已与 snapshot 状态一致），服务端仍应返回成功的 restore 结果，但可不生成新的 commit

### Diagnostics Runtime Events

- runtime event 的写入幂等应优先基于稳定幂等键（如 `vaultId + deviceId + requestId + eventType` 或等价 contract），而不是仅靠“最近 24 小时内是否存在相似事件”的模糊查重
- 若诊断摘要需要返回“最近 24 小时失败次数 / 重试次数 / 恢复次数 / 事件列表”等窗口化统计，查询必须显式带时间下界：仅统计 `occurredAt >= now - 24h` 的事件
- “最近 24 小时统计”与“当前设备 / 当前 vault 的最新状态”是两类不同语义：前者是时间窗口聚合，后者应由最新有效事件或稳定摘要字段决定，不能用 24 小时去重结果替代当前态判定
- 对离线补报、重复重试或乱序到达的 runtime event，服务端必须保证：同一幂等事件不会被重复计入窗口统计，不同时间发生的合法新事件不会因缺少时间边界而被旧事件错误吞掉

---

## 配置项

`apps/server/src/config/config.ts` 需要新增或明确以下配置：

```ts
interface Config {
  port: number;
  env: string;
  cors: {
    origin: string[];
    credentials: boolean;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  mysql: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit: number;
  };
  syncS3: {
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    presignedUrlExpirySeconds: number;
    userPrefix: string;
  };
  allowRegistration: boolean;
}
```

### 环境变量建议

- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`
- `S3_PRESIGNED_URL_EXPIRY`
- `ALLOW_REGISTRATION`

---

## DTO 约定

同步相关 DTO 建议先放到共享的 `packages/dto/src/sync.ts`，供客户端与服务端共用。

### 必备 DTO

- `RegisterDto`
- `LoginDto`
- `LoginResponseDto`
- `CreateVaultDto`
- `RegisterDeviceRequest`
- `RegisterDeviceResponse`
- `HasBlobsRequest`
- `HasBlobsResponse`
- `CreateBlobUploadUrlRequest`
- `CreateBlobUploadUrlResponse`
- `CreateBlobDownloadUrlRequest`
- `CreateBlobDownloadUrlResponse`
- `BlobRef`
- `CommitRequest`
- `CommitResponse`
- `PullResponse`
- `AckRequest`
- `SyncStatus`
- `SyncTrigger`
- `ServerConflict`
- `SyncHistoryEntry`
- `HistoryBlobResponse`
- `SnapshotRecord`
- `SnapshotRestoreResult`
- `SyncDiagnostics`
- `SyncRuntimeEvent`
- `SyncRuntimeEventAck`

---

## 安全与隔离要求

### 必须满足

- 任意 API 都不能只根据 `vaultId` 直接读写数据而不做当前用户校验
- 不能允许用户通过构造别人的 `vaultId` 或 `deviceId` 访问到别人的同步数据
- 预签名 URL 仅允许上传到当前用户当前 vault 对应的 prefix，且不得允许 `.aimo-note/**` 对象进入同步 blob 空间
- `blob-download-url` 与 `history/blob` 也必须按当前用户 + vault 权限校验，不能泄露其他用户对象下载能力
- Blob 元数据写入必须绑定 `vaultId`
- 审计日志必须记录 `userId`、`vaultId`、`deviceId`、`requestId`
- 所有同步入口都必须提取并传递 `X-Request-Id`、`X-Device-Id` 到 `request context` / `audit context`

---

## 观测与运维

### 指标

- `commit_success_total`
- `commit_conflict_total`
- `commit_fail_total`
- `pull_success_total`
- `blob_upload_request_total`
- `blob_existing_hit_total`
- `ack_total`
- `snapshot_create_total`

### 审计事件

- `user.register`
- `user.login`
- `vault.create`
- `device.register`
- `sync.commit`
- `sync.pull`
- `sync.ack`
- `sync.conflict`
- `snapshot.create`
- `snapshot.restore`

---

## 验收标准

### 功能验收

- 用户不开启同步、不登录时，仍可正常使用本地文件能力
- 用户可以在设置页登录、开启同步，并创建自己的 vault
- 不同用户之间的 vault、设备、commit、blob 逻辑完全隔离
- 同一用户两台设备在自动同步模式下可完成正常 `commit / pull / ack`
- 未变化文件不会重复上传 blob
- 断网期间本地编辑不中断；网络恢复后可自动继续同步
- 设置页提供“立即同步”按钮作为手动兜底入口
- 并发修改同一文件时，服务端能返回明确冲突信息
- 客户端可基于历史 revision 完成回溯并再次同步

### 安全验收

- 用户 A 不能访问用户 B 的 vault / device / commit / blob 元数据
- 构造其他用户的 `vaultId` / `deviceId` / `snapshotId` 请求会被拒绝
- 预签名 URL 不允许越权写入其他用户前缀

### 运行与恢复验收

- snapshot restore 会把 vault 收敛到 snapshot 的完整状态；当前 head 中存在但 snapshot 中不存在的路径会通过 `delete` 表达，而不是被隐式保留
- 同一次 restore 请求重试不会重复创建 task；同一 restore task 重跑不会重复生成第二个 `restore commit`
- `diagnostics` 的最近 24 小时统计只统计 `occurredAt >= now - 24h` 的事件，不会被窗口外旧事件污染
- runtime event 的去重依赖稳定幂等键，而不是仅靠 24 小时模糊查重
- tombstone 的自动清理通过统一调度路径触发，避免绕过互斥、审计与失败观测

### 架构验收

- `apps/server` 结构可对齐 `console/apps/server` 的启动、IOC、controller 注册方式
- 所有核心同步表均落 MySQL
- 核心同步 API 使用 `routing-controllers` 暴露
- 业务逻辑不堆在 controller 中，统一下沉到 service

---

## 实现优先级

1. **Phase 1**：本地 revision / queue / blob cache / 可选同步状态骨架
2. **Phase 2**：`apps/server` 初始化、账号系统、用户隔离、MySQL schema、自动同步 happy path
3. **Phase 3**：冲突闭环、历史查询、回溯、前端 UX
4. **Phase 4**：成本优化、快照、审计、观测、后台清理任务
