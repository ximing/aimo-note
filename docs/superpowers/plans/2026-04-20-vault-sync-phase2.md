# Vault Sync Phase 2 Implementation Plan

> **Goal:** 在 `apps/server` 中落地服务端基础架构、账号系统、用户级数据隔离、MySQL schema，并跑通“设置页登录 + 可选开启同步 + 自动后台同步”的 happy path：`has-blobs -> upload -> commit -> pull -> ack`。

## Phase 2 Scope

这是新架构的核心阶段，且本次要明确分成两条并行主线：

- **服务端主线**：`apps/server` 搭建 + auth + vault + sync API + MySQL schema
- **客户端接入主线**：本地 pending queue 接入服务端协议

### 本阶段必须交付

- 新建 `apps/server` 工程并对齐 `console/apps/server` 风格
- `Express + routing-controllers + TypeScript + TypeDI` 启动链路
- MySQL 连接、Drizzle schema、migration 机制
- 用户注册 / 登录 / 当前用户接口
- 设置页登录入口、远端 vault 创建/选择/绑定与同步开关
- vault 创建与查询接口
- device 注册与查询接口
- `has-blobs`、`blob-upload-url`、`blob-download-url`、`commit`、`pull`、`ack` API
- 用户级数据隔离与 owner 校验
- 桌面客户端自动同步 happy path 打通
- 断网后保持本地可用，恢复联网后自动重试同步
- 退出登录后同步引擎回到 `DISABLED`，但保留本地 pending queue
- 设置页提供“立即同步”手动兜底入口

### 本阶段明确不做

- 冲突 UI 闭环
- rollback UI
- snapshot 恢复
- GC / orphan blob cleanup 后台任务
- Phase 4 的 cleanup / diagnostics / snapshot restore 仅复用本阶段冻结的 `X-Request-Id`、`X-Device-Id` 与 runtime metadata contract；Phase 2 不提前实现这些能力或对应 API

---

## Architecture Notes

### 服务端落地原则

必须尽量复用 `console/apps/server` 的组织方式：

- `src/index.ts`：bootstrap
- `src/app.ts`：创建 Express app、初始化 DB、注册 routing-controllers
- `src/controllers/index.ts`：统一注册 controller
- `src/ioc.ts`：按 glob 加载 controller / service
- `src/db/connection.ts`：MySQL pool + Drizzle
- `src/middlewares/auth-handler.ts`：统一认证

### 本阶段的最小工作闭环

```text
settings login
  -> create or select remote vault
  -> bind local vault to remote vault
  -> enable sync
  -> register device
  -> auto has-blobs
  -> auto upload missing blobs
  -> auto commit
  -> auto pull
  -> download missing blobs when local cache is absent
  -> ack
  -> offline continue editing
  -> reconnect
  -> auto retry sync
```

---

## Target Files

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
│   │       ├── device.controller.ts
│   │       └── sync.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── user.service.ts
│   │   ├── vault.service.ts
│   │   ├── device.service.ts
│   │   ├── blob.service.ts
│   │   ├── audit.service.ts
│   │   ├── sync-commit.service.ts
│   │   ├── sync-pull.service.ts
│   │   └── cursor.service.ts
│   ├── db/
│   │   ├── connection.ts
│   │   ├── migrate.ts
│   │   ├── transaction.ts
│   │   └── schema/
│   │       ├── users.ts
│   │       ├── auth-sessions.ts
│   │       ├── vaults.ts
│   │       ├── vault-members.ts
│   │       ├── devices.ts
│   │       ├── blobs.ts
│   │       ├── sync-commits.ts
│   │       ├── sync-commit-changes.ts
│   │       ├── sync-file-heads.ts
│   │       ├── sync-device-cursors.ts
│   │       ├── sync-conflicts.ts
│   │       ├── sync-audit-logs.ts
│   │       └── index.ts
│   ├── middlewares/
│   │   ├── auth-handler.ts
│   │   ├── error-handler.ts
│   │   └── request-context.ts
│   ├── utils/
│   │   ├── id.ts
│   │   ├── response.ts
│   │   ├── logger.ts
│   │   └── sha.ts
│   └── types/
│       ├── express.ts
│       └── response.ts
└── drizzle/

packages/dto/src/sync.ts
packages/core/src/sync/*
apps/client/src/main/ipc/*
apps/render/src/pages/settings/*
apps/render/src/services/*
```

---

## Controller / Service 边界

### Controller 责任

- `AuthController`：注册、登录、登出、当前用户
- `VaultController`：创建 vault、查询我的 vault 列表
- `DeviceController`：注册设备、查询设备、吊销设备
- `SyncController`：`has-blobs`、`blob-upload-url`、`blob-download-url`、`commit`、`pull`、`ack`

controller 只负责：

- 读取 `@CurrentUser()`、`@Body()`、`@QueryParams()`
- 调用 service
- 返回统一 `ResponseUtil.success/error`

### Service 责任

- `AuthService`：密码校验、hash、JWT / session 逻辑
- `VaultService`：vault 创建、owner 校验、member 查询
- `DeviceService`：设备注册、刷新 lastSeen、吊销与列表
- `BlobService`：blob 命中检查、预签名上传/下载 URL、blob 元数据落库；`blob-upload-url` 到 `commit` 之间允许短暂 orphan window，未被 commit 引用且超过安全窗口的对象由后续 orphan cleanup 回收，presigned URL expiry 是自然收敛边界之一
- `SyncCommitService`：幂等、事务、head 校验、commit 落库
- `SyncPullService`：增量拉取、聚合 changes 与 `blobRefs`
- `CursorService`：推进 cursor，禁止回退

### 事务边界

必须显式规定：

- `commit`：一个数据库事务
- `pull`：只读，不需要事务
- `ack`：单次更新，可单语句或轻事务
- `register device`：单次写入，可单语句或轻事务

`commit` 事务中必须完成：

- 幂等检查
- head 校验
- `sync_commits` 写入
- `sync_commit_changes` 写入
- `sync_file_heads` 更新
- blob 引用计数更新，并与 commit 提交保持原子一致

### 审计与请求上下文基线

本阶段虽然还不做完整 diagnostics 面板，但必须把后续审计与运维的写路径打牢：

- `auth/register`、`auth/login`、`vault.create`、`device.register`、`sync.commit`、`sync.pull`、`sync.ack` 至少要落审计日志
- 审计记录至少带上 `userId`、`vaultId`、`deviceId`、`requestId`，缺失字段时也要保持稳定结构
- 所有同步相关入口都要统一提取并传递 `X-Request-Id`、`X-Device-Id` 到 request context / audit context

### Request Header Contract

为避免客户端、服务端、审计与后续 diagnostics 对 header 语义各自猜测，本阶段必须固定以下最小 contract：

- `X-Request-Id`：所有同步相关入口必传；若缺失，服务端返回稳定 `400` 或 `422`，而不是静默生成随机值
- `X-Device-Id`：所有同步相关入口都必须稳定透传与校验，包括 `has-blobs`、`blob-upload-url`、`blob-download-url`、`commit`、`pull`、`ack`
- body 中若同时出现 `requestId` 或 `deviceId`，其值必须分别与 `X-Request-Id`、`X-Device-Id` 一致；不一致时返回稳定业务错误，避免幂等键、审计上下文与业务参数分裂
- `commit` 的幂等主键以 `(vaultId, requestId)` 为准；其中 `requestId` 在传输层与审计链路上以 `X-Request-Id` 为唯一真相源，body 仅作为同值业务副本，不允许出现第二套语义
- `request-context` 中提取出的 `requestId` / `deviceId` 必须继续透传到审计写入、service 层日志与错误响应上下文
- 客户端发生重试时必须复用同一 `requestId`，不能在自动重试中隐式更换幂等键

### 本地 vault 与远端 vault 绑定基线

为避免“用户已登录并打开同步开关，但当前本地 vault 还没有明确远端归属”时出现歧义，本阶段必须把桌面端闭环补齐：

- 设置页必须允许用户为当前本地 vault 创建远端 vault，或从当前账号名下已有 vault 中选择一个进行绑定
- 绑定关系必须按本地 `vaultId` 持久化，至少稳定记录 `remoteVaultId`、绑定时间与最近一次确认的账号上下文，避免重启后丢失
- 自动同步前置条件必须同时满足：已登录、已开启同步、当前本地 vault 已绑定远端 vault；任一条件不满足都不得发起 `has-blobs` / `commit` / `pull` / `ack`
- 若当前账号下还没有可用远端 vault，设置页需提供明确创建入口，而不是要求用户离开桌面端手工补数据
- 若用户切换账号、解绑或改绑远端 vault，必须给出稳定的本地状态收敛规则；至少不能静默清空本地 pending queue、历史或运行态记录
- 若当前绑定账号上下文与登录账号不一致，或用户正在改绑到另一远端 vault，当前 vault 必须进入待确认的绑定失效状态；在用户重新确认绑定关系前，不得自动把既有 pending queue 提交到任何远端 vault
- 用户确认改绑后，只有新的账号上下文、远端 vault 绑定关系与本地 pending queue 的归属被重新确认，自动同步才允许恢复；整个过程不得静默丢弃旧 queue，也不得偷偷放行旧 queue 到新远端
- 同一用户存在多个远端 vault 时，桌面端必须明确展示“当前本地 vault 正绑定到哪个远端 vault”，避免误同步到错误空间

### Runtime Metadata Contract Freeze

为避免 Phase 2、Phase 3、Phase 4 各自落地一套运行态字段名，本阶段先把跨阶段复用的最小 contract 钉死：

- 同步运行态统一使用 `trigger`、`retryCount`、`offlineStartedAt`、`recoveredAt`、`nextRetryAt`、`requestId`、`deviceId`
- `trigger` 至少覆盖 `startup` / `login` / `local_change` / `network_recovered` / `periodic` / `manual`，后续 `rollback` 等来源只能在此集合基础上扩展，不能重命名既有字段
- 客户端本地状态、服务端审计写路径、后续 diagnostics 聚合都必须复用这些字段名与含义，避免 Phase 4 再做语义迁移
- Phase 3 的 conflict / rollback 运行态、Phase 4 的 `diagnostics/events` 与诊断面板都必须直接复用本节 contract
- Phase 4 的 orphan cleanup、diagnostics、snapshot restore 只能复用本节与 Request Header Contract 中已冻结的 `requestId` / `deviceId` / runtime metadata 语义；Phase 2 不新增这些能力的 API 与执行链路

---

## API 顺序与错误语义

### 正常顺序

```text
POST /api/v1/auth/login
POST /api/v1/vaults
POST /api/v1/devices/register
POST /api/v1/sync/has-blobs
POST /api/v1/sync/blob-upload-url
POST /api/v1/sync/commit
GET  /api/v1/sync/pull
POST /api/v1/sync/blob-download-url
POST /api/v1/sync/ack
```

### 推荐错误语义

- `401`：未登录或 token 无效
- `403`：已登录但无权访问该 vault / device
- `404`：资源不存在或对当前用户不可见
- `409`：`requestId` 冲突、head mismatch、重复状态冲突
- `422`：参数合法但业务前置条件不满足

### commit 错误分类

- `blob_missing`：客户端引用了服务端尚未记录的 blob
- `device_not_found`：设备不存在或不属于当前用户 / vault
- `vault_forbidden`：当前用户无权访问 vault
- `head_mismatch`：baseRevision 与当前 head 不一致
- `duplicate_request`：相同 requestId 已处理（通常返回已有结果，而不是 hard error）

---

## DTO 与 Drizzle 落地细化

### routing-controllers 方法形态

建议 controller 方法直接收敛为以下风格：

- `AuthController.register(@Body() dto, @Res() res)`
- `AuthController.login(@Body() dto, @Res() res)`
- `VaultController.list(@CurrentUser() user)`
- `VaultController.create(@CurrentUser() user, @Body() dto)`
- `DeviceController.register(@CurrentUser() user, @Body() dto)`
- `SyncController.hasBlobs(@CurrentUser() user, @Body() dto)`
- `SyncController.createBlobUploadUrl(@CurrentUser() user, @Body() dto)`
- `SyncController.createBlobDownloadUrl(@CurrentUser() user, @Body() dto)`
- `SyncController.commit(@CurrentUser() user, @Body() dto)`
- `SyncController.pull(@CurrentUser() user, @QueryParams() query)`
- `SyncController.ack(@CurrentUser() user, @Body() dto)`

要求：

- controller 里不直接写 Drizzle query
- 所有 owner/member 校验都在 service 内完成
- controller 只做输入参数整理、调用 service、输出 `ResponseUtil`

### DTO 字段清单

#### `CreateVaultDto`

- `name: string`
- `description?: string`

#### `RegisterDeviceRequest`

- `vaultId: string`
- `deviceId: string`
- `name: string`
- `platform?: string`
- `clientVersion?: string`

#### `HasBlobsRequest`

- `vaultId: string`
- `blobHashes: string[]`

#### `CreateBlobUploadUrlRequest`

- `vaultId: string`
- `blobHash: string`
- `sizeBytes: number`
- `mimeType?: string`

#### `CommitRequest`

- `vaultId: string`
- `deviceId: string`
- `requestId: string`
- `baseSeq: number`
- `summary?: string`
- `changes: CommitChangeDto[]`

#### `CommitChangeDto`

- `filePath: string`
- `op: 'upsert' | 'delete' | 'rename'`
- `blobHash: string | null`
- `baseRevision: string | null`
- `newRevision: string`
- `sizeBytes?: number | null`
- `metadata?: Record<string, unknown> | null`
- `filePath` 本期允许 vault 内除 `.aimo-note/**` 外的任意普通文件路径；服务端必须继续校验并拒绝 `.aimo-note/**` 或越界路径，不能只依赖客户端 watcher 过滤
- `newRevision` 作为客户端生成的稳定 revision 标识在传输与持久化链路中保持原值；服务端只能校验唯一性、归属与语义，不得在写入前后静默改写

#### `PullQueryDto`

- `vaultId: string`
- `sinceSeq: number`
- `limit?: number`

#### `AckRequest`

- `vaultId: string`
- `deviceId: string`
- `ackedSeq: number`

### Drizzle schema 实现细节

#### `users.ts`

- 主键：`id`
- 唯一约束：`email`
- 字段建议：`email`, `passwordHash`, `username`, `avatar`, `createdAt`, `updatedAt`
- 导出：`User`, `NewUser`

#### `vaults.ts`

- 主键：`id`
- 索引：`ownerUserId`
- 字段建议：`name`, `description`, `status`, `createdAt`, `updatedAt`

#### `vault-members.ts`

- 唯一约束：`(vaultId, userId)`
- 字段建议：`role = 'owner' | 'editor' | 'viewer'`
- 本期至少写入 owner 记录

#### `devices.ts`

- 主键：`id`
- 索引：`vaultId`, `userId`
- 字段建议：`name`, `platform`, `clientVersion`, `lastSeenAt`, `revokedAt`, `createdAt`, `updatedAt`
- 同一个 `deviceId` 不允许跨用户复用

#### `blobs.ts`

- 唯一约束：`(vaultId, blobHash)`
- 字段建议：`storageKey`, `sizeBytes`, `mimeType`, `refCount`, `createdByUserId`, `createdAt`
- `refCount` 首期必须实现，并和 `commit` 事务联动；同时作为 Phase 4 orphan blob cleanup 与 snapshot / tombstone 安全清理的前置基础

#### `sync-commits.ts`

- 主键：自增 `seq`
- 业务唯一键：`id`
- 幂等唯一键：`(vaultId, requestId)`
- 索引：`(vaultId, seq)`
- 字段建议：`userId`, `deviceId`, `baseSeq`, `changeCount`, `summary`, `createdAt`

#### `sync-commit-changes.ts`

- 索引：`commitSeq`, `(vaultId, filePath)`
- 字段建议：`op`, `blobHash`, `baseRevision`, `newRevision`, `sizeBytes`, `metadataJson`, `createdAt`
- 如果支持 `rename`，`metadataJson` 中建议显式带 `oldFilePath`

#### `sync-file-heads.ts`

- 唯一约束：`(vaultId, filePath)`
- 字段建议：`headRevision`, `blobHash`, `lastCommitSeq`, `isDeleted`, `updatedAt`
- 这是 `head_mismatch` 判定的主表

#### `sync-device-cursors.ts`

- 唯一约束：`(vaultId, deviceId)`
- 字段建议：`userId`, `lastPulledSeq`, `updatedAt`
- `ack` 只更新这张表

#### `sync-conflicts.ts`

- 索引：`vaultId`, `userId`
- 字段建议：`filePath`, `losingDeviceId`, `winningRevision`, `losingRevision`, `actualHeadRevision`, `remoteBlobHash`, `winningCommitSeq`, `resolvedAt`, `createdAt`
- `sync_conflicts` 中的服务端摘要字段必须与 `ServerConflict` 使用同一组核心语义，避免 commit 返回结构、落库结构、后续查询结构出现第二套并行定义
- 仅存冲突摘要，不存用户本地 conflict copy 路径

### Drizzle 命名与字段约定

为减少 schema 与 service 间的语义偏差，建议统一以下约定：

- 代码属性使用 camelCase：`ownerUserId`, `requestId`, `lastPulledSeq`
- 数据库列名使用 snake_case：`owner_user_id`, `request_id`, `last_pulled_seq`
- 所有时间字段统一为：`createdAt`, `updatedAt`, `lastSeenAt`, `resolvedAt`
- 所有主键 ID 统一使用字符串 ID，而不是数据库自增作为业务主键
- `sync_commits.seq` 是少数保留的自增字段，用作全局拉取顺序

### 变更语义约定

#### `upsert`

- 表示创建或覆盖当前文件内容
- 必须携带 `newRevision`
- 通常必须携带 `blobHash`
- 服务端接受 vault 内除 `.aimo-note/**` 外的文件路径进入本期同步模型；任何 `.aimo-note/**` 或越界路径请求都必须返回稳定业务错误，而不是落库后再由下游兜底
- `newRevision` 由客户端生成并在 commit / conflict / history 链路中保持稳定；服务端不得改写为另一套 revision

#### `delete`

- 表示删除文件的当前 head
- `blobHash = null`
- `sync_file_heads.isDeleted = true`
- 历史 revision 不删除

#### `rename`

- 本期协议允许预留，但首期服务端可按 `delete + upsert` 处理
- 若保留 `rename`，则 `metadata.oldFilePath` 必填
- 没有明确 `oldFilePath` 的 `rename` 请求一律视为非法
- Phase 2-4 的功能验收仍以 `upsert` / `delete` 为准；`rename` 仅作为向前兼容扩展位，不作为本期必需 happy path，也不应让客户端默认依赖该语义

### commit 事务执行清单

在 `SyncCommitService.commit()` 中建议严格按以下顺序实现：

1. `assertVaultOwnership(userId, vaultId)`
2. `assertDeviceOwnership(userId, vaultId, deviceId)`
3. 查询是否存在 `(vaultId, requestId)` 的既有 commit
4. 校验所有 `upsert` change 的 `blobHash` 已存在于 `blobs`
5. 开启事务
6. 对每个 change 查询 `sync_file_heads`
7. 先校验每个 `change.filePath` 都属于 vault 内且不命中 `.aimo-note/**` 或路径穿越
8. 校验 `baseRevision`
9. 确认请求中的 `newRevision` 按原值写入 commit 记录与 file head，不在服务端生成替代 revision
10. 若任一 change 冲突，写 `sync_conflicts` 摘要并整体失败
11. 写 `sync_commits`
12. 批量写 `sync_commit_changes`
13. 批量 upsert `sync_file_heads`
14. 更新 `blobs.refCount`，为 Phase 4 orphan blob cleanup 提供可信依据
15. 提交事务
16. 返回 `commitSeq + appliedChanges`

### pull 查询清单

`SyncPullService.pull()` 需要明确：

- 默认 `limit = 200`
- 最大 `limit = 1000`
- 查询条件：`vaultId = ? AND seq > sinceSeq`
- 排序：`seq ASC`
- 返回 `latestSeq`
- 若命中条数等于 limit，则返回 `hasMore = true`

### ack 更新清单

`CursorService.ack()` 需要保证：

- 当前用户拥有该 vault
- 当前设备属于该 vault 且未被吊销
- `ackedSeq >= currentLastPulledSeq`
- 如果 `ackedSeq < currentLastPulledSeq`，返回 409 或 422，不覆盖旧值

### 建议 PR 拆分

为了降低实现风险，Phase 2 建议至少拆成 6 个 PR：

1. `apps/server` 工程骨架 + config + app bootstrap
2. MySQL / Drizzle schema + migration
3. auth + vault + device 基础接口
4. blob service + presigned URL
5. commit / pull / ack 服务端链路
6. 客户端接线 + happy path 联调

## Definition of Done

Phase 2 只有在以下条件全部满足时才可视为完成：

- `apps/server` 可以独立启动，并成功连接 MySQL
- 用户能够注册、登录，并获取自己的 `vault` 列表
- 已登录用户能创建属于自己的 vault，并注册设备
- `sync/has-blobs`、`sync/blob-upload-url`、`sync/commit`、`sync/pull`、`sync/ack` 全部可用
- 任何同步 API 都会严格校验当前用户是否拥有该 vault
- `X-Request-Id` / `X-Device-Id` contract 已固定，缺失或冲突时返回稳定错误语义，不会破坏幂等与审计上下文
- `requestId` / `deviceId` 在 header 与 body 并存时的单一真相源已固定，不会形成第二套幂等或审计语义
- 同一提交重复请求时具备幂等性，不会重复落 commit
- 桌面端本地 pending change 能完成完整上传与提交闭环
- 不同用户的 vault / device / commit / blob 逻辑完全隔离

---

## Tasks

### Task 9: 创建 `apps/server` 工程骨架

**Files:**
- `apps/server/package.json`
- `apps/server/tsconfig.json`
- `apps/server/src/index.ts`
- `apps/server/src/app.ts`
- `apps/server/src/ioc.ts`

- [ ] 参考 `console/apps/server` 建立 `apps/server` 目录结构
- [ ] 配置 `express`、`routing-controllers`、`typedi`、`reflect-metadata`
- [ ] 配置 `dev` / `build` / `typecheck` / `migrate` script
- [ ] 接入 `pnpm-workspace` 现有多包工作区

### Task 10: 配置与启动链路

**Files:**
- `apps/server/src/config/env.ts`
- `apps/server/src/config/config.ts`
- `apps/server/src/app.ts`

- [ ] 定义 `JWT_SECRET`、MySQL、S3、CORS 等配置项
- [ ] 启动时加载 env 并设置时区
- [ ] 初始化 DB 连接并检查健康状态
- [ ] 初始化 routing-controllers 与全局错误处理

### Task 11: MySQL + Drizzle 基础设施

**Files:**
- `apps/server/drizzle.config.ts`
- `apps/server/src/db/connection.ts`
- `apps/server/src/db/migrate.ts`
- `apps/server/src/db/transaction.ts`

- [ ] 配置 mysql2 连接池
- [ ] 配置 Drizzle schema 导出
- [ ] 提供 migration 执行入口
- [ ] 提供事务工具给 commit service 使用

### Task 12: 用户与会话 schema

**Files:**
- `apps/server/src/db/schema/users.ts`
- `apps/server/src/db/schema/auth-sessions.ts`
- `apps/server/src/db/schema/index.ts`

- [ ] 定义 `users` 表
- [ ] 定义 `auth_sessions` 表（即使首期只用 JWT，也先保留升级位）
- [ ] 为 email、userId、expiresAt 建立必要索引

### Task 13: vault / device / sync schema

**Files:**
- `apps/server/src/db/schema/vaults.ts`
- `apps/server/src/db/schema/vault-members.ts`
- `apps/server/src/db/schema/devices.ts`
- `apps/server/src/db/schema/blobs.ts`
- `apps/server/src/db/schema/sync-commits.ts`
- `apps/server/src/db/schema/sync-commit-changes.ts`
- `apps/server/src/db/schema/sync-file-heads.ts`
- `apps/server/src/db/schema/sync-device-cursors.ts`
- `apps/server/src/db/schema/sync-conflicts.ts`
- `apps/server/src/db/schema/sync-audit-logs.ts`

- [ ] 定义所有同步核心表
- [ ] 定义 `sync_audit_logs`，为 Phase 4 诊断聚合提供稳定写路径
- [ ] 体现 `user_id` / `vault_id` 隔离关系
- [ ] 为 `vault_id + request_id`、`vault_id + file_path`、`vault_id + device_id` 建立唯一约束

### Task 14: 账号系统与认证中间件

**Files:**
- `apps/server/src/services/auth.service.ts`
- `apps/server/src/services/user.service.ts`
- `apps/server/src/controllers/v1/auth.controller.ts`
- `apps/server/src/controllers/v1/user.controller.ts`
- `apps/server/src/middlewares/auth-handler.ts`
- `apps/server/src/middlewares/request-context.ts`
- `apps/server/src/types/express.ts`

- [ ] 注册接口：邮箱、用户名、密码校验 + bcrypt hash
- [ ] 登录接口：密码校验 + JWT 签发
- [ ] `auth-handler` 从 cookie / bearer token 解析用户
- [ ] 暴露 `POST /api/v1/auth/logout`
- [ ] 服务端 `logout` 只清理认证态与远端访问能力；客户端在本阶段接线中负责把同步状态切回 `DISABLED`，且不清空本地 pending queue
- [ ] 暴露 `GET /api/v1/auth/me` 与 `GET /api/v1/user/profile`
- [ ] 为设置页登录态恢复提供可稳定轮询或启动校验的 `me` 能力
- [ ] `request-context` 提取 `X-Request-Id`、`X-Device-Id` 并挂到 `request context` 与 `audit context`
- [ ] 将 `request.user` 与 `currentUserChecker` 打通

### Task 15: VaultService 与 DeviceService

**Files:**
- `apps/server/src/services/vault.service.ts`
- `apps/server/src/services/device.service.ts`
- `apps/server/src/controllers/v1/vault.controller.ts`
- `apps/server/src/controllers/v1/device.controller.ts`

- [ ] 创建 vault，并默认写入 owner member
- [ ] 查询当前用户 vault 列表
- [ ] 注册设备并刷新 `lastSeenAt`
- [ ] 查询当前用户下指定 vault 的设备列表
- [ ] 支持设备吊销 revoke，并保证被吊销设备后续不能继续 `ack`、不能再参与 tombstone retention 的安全判定
- [ ] 提供 `assertVaultOwnership(userId, vaultId)`

### Task 16: BlobService

**Files:**
- `apps/server/src/services/blob.service.ts`
- `apps/server/src/controllers/v1/sync.controller.ts`

- [ ] 实现 `hasBlobs(vaultId, blobHashes[])`
- [ ] 生成预签名上传 URL
- [ ] 生成预签名下载 URL
- [ ] 上传 / 下载 URL 都必须限定到当前用户 + 当前 vault 的 prefix
- [ ] 预签名 URL 的 object key 规则必须由服务端固定生成，不允许客户端自定义目标 prefix
- [ ] 写入 / 更新 blob 元数据
- [ ] 固化 `blob-upload-url -> commit` 间短暂 orphan window 语义：未被 commit 引用且超过安全窗口的对象由后续 orphan cleanup 回收，presigned URL expiry 可作为自然收敛边界之一
- [ ] 本任务仅冻结 orphan window contract，不实现 orphan cleanup 调度链路

### Task 16A: AuditService 与审计落库

**Files:**
- `apps/server/src/services/audit.service.ts`
- `apps/server/src/db/schema/sync-audit-logs.ts`
- `apps/server/src/middlewares/request-context.ts`

- [ ] 定义 `sync_audit_logs` schema 与基础查询索引
- [ ] 提供统一审计写入入口，供 auth / vault / device / sync service 复用
- [ ] 至少落库 `user.register`、`user.login`、`vault.create`、`device.register`、`sync.commit`、`sync.pull`、`sync.ack`
- [ ] 审计记录稳定携带 `userId`、`vaultId`、`deviceId`、`requestId`

### Task 17: SyncCommitService

**Files:**
- `apps/server/src/services/sync-commit.service.ts`
- `apps/server/src/controllers/v1/sync.controller.ts`

- [ ] 接收 `CommitRequest`
- [ ] 校验当前用户、vault ownership、device ownership
- [ ] 校验所有 `change.filePath` 仅落在 vault 内且不命中 `.aimo-note/**`；拒绝路径穿越或写入内部元数据目录的请求
- [ ] 校验所有 `upsert` change 引用的 `blobHash` 已存在于当前 vault 的 `blobs`
- [ ] 基于 `vaultId + requestId` 做幂等去重
- [ ] 保持客户端传入的 `newRevision` 原值贯穿 `sync_commit_changes`、`sync_file_heads`、冲突响应与后续 history 链路；服务端不得静默改写 revision
- [ ] 若 body 带 `requestId` / `deviceId`，则必须与 `X-Request-Id` / `X-Device-Id` 严格一致
- [ ] 在事务中写入 `sync_commits` / `sync_commit_changes`
- [ ] 更新 `sync_file_heads`
- [ ] 原子更新 `blobs.refCount`，失败时与 commit 一起回滚
- [ ] head mismatch 时返回冲突响应，不部分提交
- [ ] 冲突响应字段与 `sync_conflicts` 落库字段保持同一组核心语义，避免服务端对同一冲突维护两套 contract
- [ ] 对成功 / 冲突 / 失败结果写入对应审计事件

### Task 18: SyncPullService + CursorService

**Files:**
- `apps/server/src/services/sync-pull.service.ts`
- `apps/server/src/services/cursor.service.ts`
- `apps/server/src/controllers/v1/sync.controller.ts`

- [ ] 实现 `pull(vaultId, sinceSeq)`
- [ ] `pull` 默认 `limit = 200`、最大 `limit = 1000`，并返回 `hasMore`
- [ ] 返回 commits、changes、`blobRefs`、latestSeq
- [ ] `blobRefs` 只暴露当前用户可见的 blob 元信息，不直接暴露越权下载能力
- [ ] `sinceSeq < 0` 等非法参数返回稳定 422 语义
- [ ] 实现 `ack(vaultId, deviceId, seq)`
- [ ] ack 仅允许 cursor 前进，不允许回退
- [ ] `pull` / `ack` 成功与失败结果都写入审计事件

### 自动同步与设置页约束

- 同步必须是用户在设置页主动开启的可选能力；未开启时应用保持本地模式。
- 用户不需要理解或手动执行 `push` / `pull`；正常路径由后台自动调度。
- 自动触发源至少包括：登录并开启同步、应用启动、本地变更入队、网络恢复、周期性轮询。
- 设置页需要提供“立即同步”按钮，用于显式触发一次同步。
- 网络不可用时应进入 `OFFLINE` 状态，保留 pending queue，不阻塞本地读写。
- 未开启同步或处于 `OFFLINE` 时，客户端仍需继续记录本地变更、历史、冲突辅助信息与 runtime metadata；只有在登录态有效且同步开启时，这些本地记录才与服务端唯一真相源对账并收敛。
- 同一用户多个 vault 同时开启同步时，调度、pending queue、cursor、runtime state 与错误恢复都必须按 `vaultId` 隔离；单个 vault 进入 `OFFLINE` / `ERROR` 不得阻塞其他 vault 继续同步。

### Sync State Transition Contract

在 Phase 1 本地状态骨架的基础上，本阶段必须把自动同步实际运行时最关键的迁移语义钉死，避免不同端对状态理解不一致：

- 未开启同步或用户已退出登录时，状态必须稳定为 `DISABLED`，即使本地仍有 pending queue 也不得继续自动发起网络同步
- 开启同步且登录态有效、当前无待处理工作时，状态进入 `IDLE`
- 本地新增 pending change、手动点击“立即同步”、应用启动恢复待处理工作时，状态进入 `PENDING`
- 真正开始执行一次 `has-blobs -> upload -> commit -> pull -> ack` 流程时，状态进入 `SYNCING`
- 网络不可用、DNS 失败、服务端暂时不可达等可自动恢复问题进入 `OFFLINE`；token 失效、权限异常、数据前置条件破坏等需要用户干预的问题进入 `ERROR`
- 处于 `DISABLED` 或 `OFFLINE` 时，本地记录仍需持续更新，供后续恢复同步与诊断使用；这些记录不能替代服务端作为跨设备同步事实的唯一真相源
- 从 `OFFLINE` 恢复后，先回到 `PENDING` 或直接进入 `SYNCING`，不得跳过待处理工作直接标记 `IDLE`
- 任一状态切换都必须同步更新 `last_sync_*`、`last_sync_error`、`retry_count`、`next_retry_at` 等运行态，供 Phase 4 diagnostics 直接复用

### Runtime Error Classification Baseline

为避免客户端、服务端与后续 diagnostics 对 `OFFLINE` / `ERROR` / blob 下载失败各自猜测，本阶段需要先固定最小错误分类语义：

- 网络不可用、DNS 失败、连接超时、服务端暂时不可达等可自动恢复问题进入 `OFFLINE`
- token 失效、权限异常、`blob_not_visible`、header/body contract 冲突、参数前置条件被破坏等问题进入 `ERROR`
- `blob-download-url` 过期属于可重试业务错误：应优先刷新下载 URL 并重试，而不是直接视为鉴权失败
- blob 内容下载阶段的网络错误进入 `OFFLINE`；blob 可见性或鉴权错误进入 `ERROR`
- 上述分类必须在 DTO 错误码、客户端恢复策略与设置页 / renderer 提示文案中保持同一语义

### Task 19: DTO 对齐客户端

**Files:**
- `packages/dto/src/sync.ts`
- `packages/dto/src/index.ts`

- [ ] 增加 auth / vault / device / sync DTO
- [ ] 补齐 `CreateBlobDownloadUrlRequest` / `CreateBlobDownloadUrlResponse` / `BlobRef`
- [ ] `apps/server` 与桌面端共用 DTO
- [ ] 明确 `CommitRequest`、`CommitResponse`、`ServerConflict`
- [ ] 明确 `requestId` / `deviceId` 在 header 与 body 同时出现时的一致性规则，避免客户端与服务端各自猜测
- [ ] 冻结 `trigger`、`retryCount`、`offlineStartedAt`、`recoveredAt`、`nextRetryAt`、`requestId`、`deviceId` 等跨阶段运行态字段名，供 Phase 3 / Phase 4 直接复用
- [ ] 明确 `PullQueryDto.limit`、`PullResponse.hasMore` 等分页字段
- [ ] 明确关键错误码 / 错误类型，避免客户端恢复策略依赖隐式约定
- [ ] 明确 `blob_download_expired`、`blob_download_failed`、`blob_not_visible` 等下载相关错误，以及它们对应的 `OFFLINE` / `ERROR` / 可重试语义
- [ ] 在 DTO contract 说明中标注：Phase 4 cleanup / diagnostics / snapshot restore 复用 Phase 2 冻结的 `requestId` / `deviceId` / runtime metadata 语义，Phase 2 不新增 diagnostics API 与 snapshot restore DTO

### Task 20: 客户端接入服务端 happy path

**Files:**
- `packages/core/src/sync/server_adapter.ts`
- `packages/core/src/sync/blob_uploader.ts`
- `packages/core/src/sync/engine.ts`
- `apps/client/src/main/ipc/*`
- `apps/render/src/pages/settings/*`
- `apps/render/src/services/*`

- [ ] 接入登录后 token
- [ ] 设置页可查询当前账号下的远端 vault 列表，并展示当前本地 vault 的绑定状态
- [ ] 设置页可为当前本地 vault 创建远端 vault，或选择已有远端 vault 完成绑定
- [ ] 绑定关系按本地 `vaultId` 持久化保存，重启后仍可恢复；切换账号时能检测并提示当前绑定是否仍有效
- [ ] 若当前绑定因切换账号、解绑或改绑而失效，自动同步必须被阻断，并给出明确的确认 / 重绑入口；在用户确认前不得把既有 pending queue 提交到新的远端 vault
- [ ] 用户确认改绑后，只有新的账号上下文、远端 vault 绑定关系与本地 pending queue 的归属被重新确认，自动同步才允许恢复；整个过程不得静默丢弃旧 queue，也不得偷偷放行旧 queue 到新远端
- [ ] 同步仅在用户于设置页显式开启后启动；未开启时保持纯本地模式
- [ ] 当前本地 vault 未绑定远端 vault 时，不发起任何同步网络请求，并给出明确引导
- [ ] 调用 `has-blobs`、`blob-upload-url`、`blob-download-url`、`commit`、`pull`、`ack`
- [ ] 在启动、登录成功、开启同步、本地变更入队、网络恢复、周期性轮询时自动触发同步
- [ ] 自动触发需带上明确来源，如 `startup` / `login` / `local_change` / `network_recovered` / `periodic` / `manual`
- [ ] 所有同步请求需透传 `trigger` / `requestId` / `deviceId`，并统一使用 Phase 2 冻结的运行态字段名承载 `retryCount` / 恢复上下文等元数据
- [ ] `X-Request-Id` / `X-Device-Id` 缺失、冲突或与 body 不一致时返回稳定错误语义，而不是由客户端或服务端各自兜底猜测
- [ ] 自动重试时复用同一 `requestId`，保证 `commit` 幂等语义与诊断链路一致
- [ ] `DISABLED` 或已退出登录时，即使本地仍有 pending queue，也不得继续发起 `has-blobs` / `commit` / `pull` / `ack` 等网络请求
- [ ] pull 后本地若缺失 blob cache，可通过 `blob-download-url` 下载远端内容并完成落盘
- [ ] `blob-download-url` 过期时优先刷新下载 URL 并重试；网络类下载失败进入 `OFFLINE`，可见性 / 鉴权失败进入 `ERROR`
- [ ] 成功后推进本地 queue 与 cursor
- [ ] 检测网络不可用时切到 `OFFLINE`，停止无效请求风暴并等待恢复
- [ ] 同步错误时保留 pending queue，可在恢复联网后自动重试
- [ ] 连续离线抖动或周期性轮询命中时，自动同步引擎需串行化 / 去抖，避免并发请求风暴
- [ ] 用户退出登录后，同步引擎回到 `DISABLED`，但本地 pending queue 与本地历史继续保留；重新登录并开启同步后可继续提交
- [ ] 设置页提供“立即同步”按钮，复用同一同步引擎立即执行一次同步
- [ ] 设置页展示登录用户、同步开关、最近同步时间、最近错误、当前状态
- [ ] 同一用户多个 vault 同时开启同步时，各 vault 自动同步可独立推进；一个 vault 的 `OFFLINE` / `ERROR` 不会污染其他 vault 的状态、队列与 cursor
- [ ] renderer 展示 `DISABLED / OFFLINE / SYNCING / ERROR` 等状态，不影响本地编辑

### Task 21: 用户隔离验收用例

**Scope:**
- 服务端单测 / 集成测试 / 客户端接口测试

- [ ] 用户 A 不能读用户 B 的 vault 列表
- [ ] 用户 A 不能对用户 B 的 vault 提交 commit
- [ ] 用户 A 不能为用户 B 的 vault 申请 blob 上传 URL
- [ ] 用户 A 不能为用户 B 的 vault 申请 blob 下载 URL
- [ ] 用户 A 不能推进用户 B 设备的 cursor
- [ ] 即使用户 A 已拿到自己的预签名上传 URL，也不能通过篡改 object key / prefix 实际写入用户 B 的对象路径

---

## Acceptance Tests

### 服务端侧

- [ ] 服务启动成功，并完成 MySQL health check
- [ ] 注册 / 登录 / 登出 / 当前用户 / profile 接口可用
- [ ] 创建 vault 后，数据库可看到 owner_user_id 与 vault_members
- [ ] 注册设备后，设备归属当前用户与当前 vault
- [ ] `commit` 幂等：同 `requestId` 重试不会生成第二条 commit
- [ ] `.aimo-note/**` 或越界 `filePath` 的 commit 请求会被稳定拒绝，服务端不会把这些路径写入同步主链路
- [ ] `pull` 默认分页参数、`hasMore` 与最大 `limit` 行为稳定
- [ ] `pull` 仅返回 `sinceSeq` 之后的提交与当前用户可见的 `blobRefs`
- [ ] `ack` 不允许回退 cursor
- [ ] `request context` 能稳定提取 `requestId`、`deviceId`
- [ ] 缺失 `X-Request-Id` 或必需的 `X-Device-Id` 时，相关同步接口返回稳定 400/422 语义，不静默生成新值
- [ ] header 与 body 中 `requestId` / `deviceId` 不一致时会被拒绝，且错误语义稳定
- [ ] 审计日志可查询到 `user.register`、`user.login`、`vault.create`、`device.register`、`sync.commit`、`sync.pull`、`sync.ack`
- [ ] 审计记录稳定包含 `userId`、`vaultId`、`deviceId`、`requestId`
- [ ] `commit` 成功时 `sync_file_heads` 与 `blobs.refCount` 原子一致；失败回滚时不会留下脏 refCount
- [ ] `blob-upload-url` 到 `commit` 间允许短暂 orphan window；未被 commit 引用对象的回收仅作为后续 phase contract，不阻塞本阶段 happy path
- [ ] `blob_missing`、`head_mismatch`、非法 `sinceSeq`、ack 回退等错误返回稳定语义

### 客户端 + 服务端联调

- [ ] 用户未登录、未开启同步时，应用仍可正常使用本地能力
- [ ] 用户可在设置页登录、为当前本地 vault 创建或选择远端 vault 并完成绑定，然后开启同步，后台自动完成首次同步链路
- [ ] 用户退出登录后，本地 pending queue 不丢失，同步状态回到 `DISABLED`，重新登录并开启同步后可继续提交旧变更
- [ ] 切换账号、解绑或改绑远端 vault 后，若当前绑定关系已失效，自动同步会被阻断且本地 pending queue 继续保留，直到用户显式确认新的绑定关系
- [ ] 未经用户显式确认，不会把旧账号或旧绑定关系下积累的 pending change 自动提交到新账号或新远端 vault
- [ ] 当前本地 vault 未绑定远端 vault 时，即使用户已登录或本地 queue 持续累积，也不会继续发起任何同步网络请求
- [ ] 同步被显式关闭或状态为 `DISABLED` 时，即使本地 queue 持续累积，也不会继续发起任何同步网络请求
- [ ] 本地新建普通文件后，首次同步会先上传 blob 再成功 commit；`.aimo-note/**` 内容不会进入远端同步主链路
- [ ] 第二次无变更同步时，不发生重复 blob 上传
- [ ] 远端新增文件后，本地 pull 可在本地无缓存时下载 blob、落盘并推进 cursor
- [ ] 成功 commit、pull、history 查询与后续 rollback 使用的 revision 与客户端提交的 `newRevision` 保持同一标识，不因服务端写入而漂移
- [ ] 新设备或清空本地 blob cache 后，仍可仅依赖远端 `pull + blob-download-url` 完成内容重建
- [ ] 网络失败后 pending change 保留，断网期间本地编辑不中断，恢复后自动继续提交
- [ ] 周期性轮询会进入与其他触发源相同的同步引擎，不会形成第二套手工同步流程
- [ ] `blob-download-url` 过期、blob 下载网络失败、blob 不可见等场景的用户反馈与 `OFFLINE` / `ERROR` 分类稳定可预测
- [ ] 同步关闭或离线期间，本地新增变更、历史与运行态信息仍被记录；重新开启同步或恢复联网后可继续与服务端状态对账
- [ ] 同一用户同时开启两个 vault 的同步时，各自的本地/远端 vault 绑定、queue、cursor、runtime state 与最近错误保持隔离；其中一个 vault 断网或失败时，另一个 vault 仍可继续自动同步
- [ ] 连续离线抖动时不会无限并发触发多轮同步
- [ ] `OFFLINE` 与 `ERROR` 的进入条件稳定可预测：网络类错误进入 `OFFLINE`，鉴权/权限类错误进入 `ERROR`
- [ ] 从 `OFFLINE` 恢复后会重新回到 `PENDING` / `SYNCING` 完成待处理工作，而不是错误地直接显示 `IDLE`
- [ ] 设置页点击“立即同步”可在自动调度之外立刻触发一次同步
- [ ] 用户未登录、未开启同步或处于 `OFFLINE` 时，本地编辑、搜索、索引与历史能力继续可用，不因同步状态迁移而退化
- [ ] 两台设备并发修改同一文件时，后提交设备会收到稳定 `head_mismatch` / `ServerConflict`，前提交设备仍可继续正常 `pull` / `ack`；完整冲突 UX 留到 Phase 3

### 隔离验证

- [ ] 用户 A 访问用户 B 的 `vaultId` 时返回 403/404
- [ ] 预签名上传 URL 无法通过篡改 key / prefix 实际写入用户 B 的 prefix，S3 侧真实写入验证同样失败
- [ ] 使用用户 A 的 token + 用户 B 的 `deviceId` 调用 ack 会失败
- [ ] 已吊销设备无法继续 `ack` 或参与后续保留窗口判定

---

## Exit Criteria

满足以下条件即可进入 Phase 3：

- `apps/server` 已具备稳定的账号 + vault + sync 基础设施
- 桌面端已具备“当前本地 vault -> 远端 vault”的创建、选择、绑定与恢复闭环
- 服务端已把“仅同步 vault 内除 `.aimo-note/**` 外的文件”落实到 commit 校验与验收，避免仅靠客户端过滤维持边界
- 用户隔离模型已真正落地到 service / schema / API
- 客户端与服务端的自动同步 happy path 已跑通
- `logout -> DISABLED` 与 pending queue 保留语义已明确落地
- 预签名 URL 前缀隔离已可被稳定验证，Phase 3 无需再返工该基础约束
- 设置页已经承载登录、同步开关、状态展示与“立即同步”入口
- 本地编辑、搜索、索引与历史能力在 `DISABLED` / `OFFLINE` 场景下未因接入远端同步而退化
- 多 vault 场景下的本地状态隔离与自动同步调度已具备基础验收，后续 phase 无需回头重做同步状态模型
- `blob-upload-url -> commit` orphan window 语义与后续 cleanup 收敛边界（含 presigned URL expiry）已冻结；但 cleanup / diagnostics / snapshot restore 实现未提前纳入 Phase 2
- 用户无需手动 `push` / `pull` 即可完成日常同步，且仍保留设置页“立即同步”兜底入口
- 新设备或清空本地 blob cache 后，已可通过 `pull + blob-download-url` 稳定完成内容重建
- Phase 3 只需要补冲突 UX、历史与回溯，不再重构服务端主干
