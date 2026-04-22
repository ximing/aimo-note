# Vault Sync Phase 1 Implementation Plan

> **Goal:** 建立服务端协调方案下的本地执行基础：本地 revision、blob cache、change queue、设备身份，以及“可选同步 + 离线可用 + 自动同步”所需的状态机骨架。

## Phase 1 Scope

本阶段只做本地能力，不接入真实服务端提交，但所有本地模型必须为后续自动 `commit / pull / ack` 协议与后台同步调度留出稳定扩展点。

### 本阶段必须交付

- 监听 vault 内除 `.aimo-note/**` 外的所有文件
- 本地 SQLite schema 升级到 revision / queue 模型
- 本地内容缓存从“按版本号目录”调整为“按 blob hash 寻址”
- 为 create / update / delete 生成 `sync_local_changes`
- 建立 `DISABLED / IDLE / PENDING / SYNCING / OFFLINE / ERROR` 状态机骨架
- 持久化同步开关，保证“未开启同步也能正常使用”
- 为后续服务端同步保留 `last_pulled_seq` / `last_successful_commit_seq`

### 本阶段明确不做

- 真实网络通信
- Blob 上传
- 服务端 commit
- 冲突 UI
- 回滚拉取远端内容

---

## Architecture Notes

### 为什么 Phase 1 要先改本地模型

旧方案本地模型围绕 `version`、`manifest`、`changelog` 展开；新方案要求本地先具备：

- `baseRevision` 语义
- `blobHash` 缓存
- 待提交队列
- 可重复执行的状态转换

如果不先在本地打好这层基础，Phase 2 会被迫一边接服务端一边重写本地表结构，风险更高。

### 本地职责

| 模块 | 职责 |
|---|---|
| `FileWatcher` | 监听 vault 文件变化，过滤 `.aimo-note/**` 与临时文件 |
| `BlobCache` | 计算 SHA-256，按 hash 落本地内容缓存 |
| `VersionManager` | 写本地 revision 记录，保留恢复所需历史 |
| `ChangeQueue` | 为后续提交生成 pending change |
| `SyncStateStore` | 持久化设备 ID、cursor、同步开关与状态机 |

### Auth Independence Guardrail

即使 Phase 1 还不接入真实登录态，本地同步模型也必须从一开始就满足：

- 本地 revision、blob cache、pending queue 不依赖远端登录 session 才能读取
- 后续 Phase 2 接入登录 / 登出时，`logout` 只能清理认证态与远端访问能力，不能清空本地 pending queue
- 同步开关、pending queue、历史记录必须能跨“未登录 / 已登录 / 退出登录”状态稳定保留
- 即使同步尚未开启，当前设备仍需持续记录本地变更、历史与运行态诊断信息，为后续开启同步、恢复联网或排查问题保留依据

### State Scope Guardrail

为避免 Phase 2 接入多 vault 同步时重做本地状态模型，本阶段必须提前约束：

- `device_id` 属于当前桌面设备级全局状态，可全局单份持久化
- `sync_enabled`、`sync_status`、`last_pulled_seq`、`last_successful_commit_seq`、`last_sync_*`、`offline_reason`、`retry_count`、`next_retry_at` 等运行态必须支持按 `vaultId` 维度隔离
- `sync_conflicts` 在 Phase 1 仅作为 schema 占位，不要求形成完整冲突闭环；真实读写语义在 Phase 3 落地

### State Transition Baseline

虽然本阶段还不接入真实网络同步，但必须把后续自动同步引擎依赖的最小状态迁移契约先固定下来，避免 Phase 2 再次重塑接口与持久化语义：

- 应用启动恢复本地状态后，若 `sync_enabled = false`，状态必须稳定为 `DISABLED`
- 应用启动恢复本地状态后，若 `sync_enabled = true` 且当前无待处理工作，状态进入 `IDLE`
- 应用启动恢复本地状态后，若 `sync_enabled = true` 且已存在 pending change 或显式 `requestSync(trigger)`，状态进入 `PENDING`
- 本阶段不执行真实网络请求，但必须为后续 `SYNCING`、`OFFLINE`、`ERROR` 三态预留稳定持久化字段与恢复语义
- `OFFLINE` 只用于表达网络不可用、服务端暂时不可达等可自动恢复的瞬时问题；`ERROR` 预留给 token 失效、权限异常、数据损坏等需要用户关注的非瞬时问题
- 任一状态迁移都必须同步更新对应 runtime state，例如 `last_sync_trigger`、`last_sync_error`、`offline_reason`、`retry_count`、`next_retry_at`
- 未开启同步时，本地 queue 仍可继续积累，且需要保留后续诊断与恢复所需的本地记录，但状态不得被误推进到 `PENDING` / `SYNCING`

---

## Target Files

```text
packages/core/src/sync/
├── index.ts
├── db.ts
├── schema.sql
├── types.ts
├── device.ts
├── blob_cache.ts          ← NEW
├── change_queue.ts        ← NEW
├── change_logger.ts
├── version_manager.ts
├── file_watcher.ts
├── state.ts               ← NEW
└── __tests__/
    ├── db.test.ts
    ├── blob_cache.test.ts
    ├── change_queue.test.ts
    ├── file_watcher.test.ts
    └── version_manager.test.ts

packages/dto/src/
└── sync.ts                ← 增补 revision / queue / status 类型
```

---

## Schema Changes

### 本地 SQLite 目标表

- `sync_devices`
- `sync_file_versions`
- `sync_local_changes`
- `sync_state`
- `sync_conflicts`

### `sync_state` 必备 key

> 其中 `device_id` 可为设备级全局 key；其余同步与运行态 key 必须支持按 `vaultId` 隔离，避免多 vault 场景状态串扰。

- `device_id`
- `sync_enabled`
- `sync_status`
- `last_pulled_seq`
- `last_successful_commit_seq`
- `last_sync_started_at`
- `last_sync_completed_at`
- `last_sync_trigger`
- `last_sync_error`
- `offline_reason`
- `retry_count`
- `next_retry_at`
- `last_network_recovered_at`

---

## Definition of Done

Phase 1 只有在以下条件全部满足时才可视为完成：

- `.aimo-note/**` 以外的文件会进入 blob cache、version history 或 change queue；内部元数据目录不会进入同步模型
- 本地 create / update / delete 均生成带 `baseRevision` 的 pending change
- 内容缓存按 `blobHash` 去重；同内容重复写入不会重复落盘
- 用户未开启同步时，应用仍可正常运行，本地模型不会依赖登录态
- 本地状态机能稳定覆盖 `DISABLED / IDLE / PENDING / SYNCING / OFFLINE / ERROR` 六态骨架，并明确各状态的持久化与恢复语义
- 本地模型中已显式出现 `last_pulled_seq` 与 `last_successful_commit_seq`
- `sync_enabled`、cursor 与 runtime state 已在本地状态模型、作用域编码与测试中证明可按 `vaultId` 隔离；这里验证的是本地隔离基础，而不是 Phase 2 的真实多 vault 联调
- 已为后续登录 / 退出登录接线预留稳定语义：本地 revision / pending queue 不依赖 auth session；真正的 `logout -> DISABLED` 联调验收放在 Phase 2
- 不依赖 `manifest.json` / `changelog.json` / `sync.lock`

---

## Tasks

### Task 1: 扩展 dto 同步类型

**Files:**
- `packages/dto/src/sync.ts`
- `packages/dto/src/index.ts`

- [ ] 增加 `SyncRevisionRecord`、`SyncLocalChange`、`SyncStatus`、`SyncTrigger`、`BlobRef` 类型
- [ ] 明确 `baseRevision`、`newRevision`、`blobHash`、`status`、`trigger` 字段
- [ ] `SyncTrigger` 至少预留 `startup` / `login` / `local_change` / `network_recovered` / `periodic` / `manual`
- [ ] `SyncStatus` 至少覆盖 `DISABLED / IDLE / PENDING / SYNCING / OFFLINE / ERROR`
- [ ] 导出给 `packages/core` 与后续 IPC 使用

### Task 2: 重写本地 schema

**Files:**
- `packages/core/src/sync/schema.sql`
- `packages/core/src/sync/db.ts`

- [ ] 新增 `sync_local_changes` 表
- [ ] 将 `sync_file_versions.version` 调整为 `revision`
- [ ] 为 `blob_hash`、`status`、`file_path` 建立索引
- [ ] 为 `sync_state` 预置必要 key，包括 `sync_enabled`
- [ ] 明确 `sync_state` 的设备级 / vault 级作用域编码方式
- [ ] `sync_conflicts` 仅做前向兼容占位，不在本阶段承担完整冲突逻辑

### Task 3: 实现设备身份与状态存储

**Files:**
- `packages/core/src/sync/device.ts`
- `packages/core/src/sync/state.ts`

- [ ] 生成稳定 `device_id`
- [ ] 存储 `device_name`、`last_seen_at`
- [ ] 提供 `getStatus()` / `setStatus()` / `updateCursor()` 接口
- [ ] 提供 `isSyncEnabled()` / `setSyncEnabled()` 接口，支撑设置页同步开关
- [ ] 提供 `updateRuntimeState()` 等接口，持久化 trigger / offline / retry 相关运行态，为 Phase 4 诊断面板预留稳定数据来源
- [ ] 明确最小状态迁移表：至少覆盖应用启动恢复、同步开关切换、pending change 入队、手动 `requestSync(trigger)` 等事件如何驱动 `DISABLED / IDLE / PENDING`
- [ ] `setSyncEnabled()` 切换时只更新本地状态，不依赖登录态或远端可用性

### Task 4: 实现 BlobCache

**Files:**
- `packages/core/src/sync/blob_cache.ts`
- `packages/core/src/sync/__tests__/blob_cache.test.ts`

- [ ] 读取文件内容并计算 SHA-256
- [ ] 以 `blobs/sha256/ab/cd/{hash}` 的本地布局缓存内容
- [ ] 同 hash 内容重复写入时返回已有路径
- [ ] 提供 `hasBlob()` / `putBlob()` / `readBlob()`

### Task 5: 重写 VersionManager

**Files:**
- `packages/core/src/sync/version_manager.ts`
- `packages/core/src/sync/__tests__/version_manager.test.ts`

- [ ] 基于 `revision` 而非 `v1` / `v2` 编号存储历史
- [ ] 记录 `blobHash`、`source`、`isDeleted`
- [ ] 支持查询 file head 与历史记录
- [ ] 删除操作只写 tombstone，不删历史内容

### Task 6: 实现 ChangeQueue

**Files:**
- `packages/core/src/sync/change_queue.ts`
- `packages/core/src/sync/change_logger.ts`
- `packages/core/src/sync/__tests__/change_queue.test.ts`

- [ ] 将文件变更写入 `sync_local_changes`
- [ ] 为 upsert / delete 记录 `baseRevision`
- [ ] 提供 `listPending()` / `markUploading()` / `markCommitted()` / `markFailed()`
- [ ] 保证重复扫描同一文件时不会无限插入重复 pending 记录

### Task 7: 收敛 FileWatcher 行为

**Files:**
- `packages/core/src/sync/file_watcher.ts`
- `packages/core/src/sync/__tests__/file_watcher.test.ts`

- [ ] 监听 vault 内除 `.aimo-note/**` 外的所有文件
- [ ] 过滤 `.aimo-note/**` 与临时文件
- [ ] 将 create / change / unlink 映射为 queue 事件
- [ ] 去抖，避免编辑器连发写入造成队列污染

### Task 8: 暴露 SyncService 本地骨架

**Files:**
- `packages/core/src/sync/index.ts`
- `packages/core/src/sync/types.ts`

- [ ] 暴露 `getPendingChanges()`、`getSyncStatus()`、`getLastPulledSeq()`、`isSyncEnabled()`、`getSyncRuntimeState()`
- [ ] 预留 `requestSync(trigger)` / `pull()` / `commit()` / `ack()` 方法签名，但本阶段不执行网络行为
- [ ] `requestSync(trigger)` 至少支持 `startup` / `login` / `local_change` / `network_recovered` / `periodic` / `manual` 触发来源透传，并写入本地 runtime state
- [ ] `ack()` 骨架至少要能表达“本地 apply pull 成功后推进 cursor”的后续扩展位，避免 Phase 2 二次改接口形状
- [ ] 明确后续由 Phase 2 接入自动同步调度与手动“立即同步”入口

---

## Acceptance Tests

- [ ] 新建任意普通文件后，产生 blob cache、revision 记录、pending queue
- [ ] 连续编辑同一文件，pending queue 行为符合预期，不出现无限重复记录
- [ ] 删除文件后写入 tombstone，历史仍可查询
- [ ] 相同内容的两个文件共享同一 `blobHash`
- [ ] `.aimo-note/**` 不会进入同步模型，其余普通文件类型可进入同步模型
- [ ] 未登录、未开启同步时，应用仍能正常使用本地能力
- [ ] 未登录、未开启同步时，本地编辑、搜索、索引与历史能力保持可用，不因同步状态骨架而退化
- [ ] 未登录、未开启同步时，本地仍会记录 pending change、历史与运行态信息，供后续开启同步或问题排查使用
- [ ] 开启或关闭同步开关不会破坏本地 revision / pending queue
- [ ] `requestSync(trigger)` 可稳定记录 `startup` / `login` / `local_change` / `network_recovered` / `periodic` / `manual` 等来源
- [ ] `sync_enabled = false` 时，即使本地 queue 持续累积，状态仍保持 `DISABLED`，不会误推进到 `PENDING`
- [ ] `sync_enabled = true` 时，应用启动恢复后会根据是否存在 pending change 稳定落到 `IDLE` 或 `PENDING`
- [ ] `OFFLINE` 与 `ERROR` 的运行态字段已预留且语义区分清晰，Phase 2 无需重塑持久化模型
- [ ] `ack()` 骨架与 `last_pulled_seq` / cursor 状态扩展位已预留，Phase 2 无需重塑本地接口
- [ ] 在本地状态模型与测试中，多 vault 场景下各 vault 的 `sync_enabled`、cursor 与运行态不会互相串扰；真实多 vault 联调留到 Phase 2 之后验证
- [ ] 已为后续登录态接线预留 `logout -> DISABLED` 且不清空本地 pending queue 的稳定语义；真实认证联调验收放在 Phase 2
- [ ] 重启后仍能恢复 `device_id`、`sync_enabled`、sync state、pending queue

---

## Exit Criteria

满足以下条件即可进入 Phase 2：

- 本地已具备稳定的 revision / queue / blob cache / sync toggle 基础
- 不再依赖旧的 `manifest` / `changelog` 思维组织本地数据
- 设置页同步开关与自动同步触发骨架已有稳定本地状态承载
- 未开启同步时，本地编辑、搜索、索引与历史底线已被明确验证，后续 phase 不得因接入远端同步而回退
- `sync_enabled`、cursor 与运行态字段已验证按 `vaultId` 隔离，多 vault 不会串扰
- 后续接服务端时无需重建本地数据库模型，只需补网络层、自动同步调度与协议编排
