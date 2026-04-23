# Vault Sync Phase 4: Cost, Recovery, and Operability

> **Goal:** 在 `apps/server + MySQL + S3 blob store` 方案上，补齐成本优化、快照恢复、审计观测、后台任务，让同步系统进入长期可维护状态。

## Phase 4 Scope

本阶段补齐三类长期能力：

- **成本优化**：本地 GC、服务端 orphan blob 清理、tombstone retention
- **恢复能力**：快照创建、列表、恢复、设备重建
- **可运维性**：审计日志、同步指标、后台任务、诊断接口

### 本阶段必须交付

- 本地旧 revision / blob cache GC
- 服务端 orphan blob 清理任务
- 服务端 snapshot 元数据与恢复任务
- 快照创建 / 列表 / 恢复的桌面端入口与任务状态可视化
- 明确 tombstone retention 策略并实现安全清理
- 审计日志与同步指标
- 用户 / 设备 / vault 维度的诊断能力
- 诊断信息可区分自动同步、手动同步、离线重试等关键状态
- renderer 诊断面板可直接展示最近同步结果、失败原因、离线与重试信息

---

## Architecture Notes

### Tombstone Retention Rule

删除产生的 tombstone 不能只按时间清理，至少需要同时考虑：

- tombstone 年龄是否超过保留窗口
- 所有未吊销设备的 `lastPulledSeq` 是否已经越过对应删除提交
- 目标 blob 是否仍被历史 revision / snapshot / 当前 head 引用

### Ref Count Safety Rule

`blobs.refCount` 可以作为清理候选的快速过滤条件，但不能成为删除对象的唯一真相源：

- `refCount = 0` 只表示“可进入进一步校验的候选集合”，不能直接删除
- 真正删除前仍需复查当前 head、历史 revision、snapshot 与其他保留引用是否仍指向该 blob
- 若 `refCount` 与实际引用关系不一致，应记录诊断 / 审计并跳过删除，而不是盲删

### Cleanup Canonical Path Rule

tombstone / orphan cleanup 必须固定一条 canonical 路径，避免不同触发入口出现语义漂移：

- 后台自动清理、失败补偿重试、未来可能的手动触发都必须复用同一条 cleanup 路径
- `BlobService` 只负责单次清理执行（判定 + 对象/元数据更新），不承载定时调度策略
- `SchedulerService` 负责统一调度、vault 级互斥、重试编排与观测，避免零散入口绕过审计上下文

### Orphan Window Rule

`blob-upload-url -> commit` 之间允许存在短暂 orphan window：

- 上传成功但尚未被 commit 引用的 blob 可短时存在，不视为异常
- 超过安全窗口后仍未被 commit 引用的对象，必须由 orphan cleanup 回收
- presigned upload URL expiry 是自然收敛边界之一，但不是唯一清理判定条件

### History Retention Rule

为避免 Phase 4 的清理能力反向破坏 Phase 3 已交付的历史 / rollback 功能，本阶段额外固定以下边界：

- 本阶段不引入“服务端历史 revision 裁剪”作为默认行为；只做本地旧缓存、orphan blob、tombstone 等安全清理
- 只要某条 revision 仍能通过 `history` API 返回，对应 `history/blob -> blob-download-url -> rollback` 链路就必须继续可用
- 若未来需要限制历史保留窗口或裁剪旧 revision，必须作为单独 phase 明确产品策略、UI 提示与迁移/验收方案，不能在本阶段通过后台清理隐式引入

### Snapshot Restore Rule

snapshot restore 不是“直接把数据库状态改回去”，而应该：

- 创建可追踪的 restore 任务
- restore diff 非空时生成新的 `restore commit`，让其他设备继续通过普通 `pull` 收敛
- 若 restore diff 为空（当前 head 已与 snapshot 一致），仍返回成功，但可不生成新的 commit
- `GET /snapshots/:id` 与相关 DTO 需稳定表达“成功但无新 commit”的 no-op restore 语义
- 必须提供可轮询的任务状态查询接口，避免客户端只能依赖列表页猜测 restore 是否完成

### Diagnostics Write Path

诊断信息不能只靠 `GET /api/v1/sync/diagnostics` 临时现算；至少需要一条稳定写路径，把以下运行时事实沉淀下来：

- 自动 / 手动 / rollback / 离线恢复重试等触发来源
- `retryCount`、`offlineStartedAt`、`recoveredAt`、`nextRetryAt`
- 最近失败请求的 `requestId` / `deviceId` / 错误摘要
- 同步关闭或离线期间尚未上报到服务端的本地运行态记录与冲突处理辅助信息

建议采用“服务端审计日志 + 客户端运行时事件上报 + 当前设备本地状态”三层组合：

- 服务端聚合跨设备最近同步摘要与历史事件，并继续作为跨设备同步事实与冲突摘要的唯一真相源
- 客户端继续持有当前设备的实时 `OFFLINE` / 下次重试等瞬时状态，以及同步关闭或离线期间尚未上报的本地记录
- `trigger`、`retryCount`、`offlineStartedAt`、`recoveredAt`、`nextRetryAt`、`requestId`、`deviceId` 等字段名必须直接复用 Phase 2 已冻结的 contract，不能在 Phase 4 改名或局部重解释
- runtime event 写入幂等应优先基于稳定幂等键（如 `vaultId + deviceId + requestId + eventType` 或等价 contract），不能仅依赖“最近 24 小时相似事件”做模糊查重
- 诊断摘要里的“最近 24 小时统计”必须显式只统计 `occurredAt >= now - 24h` 的事件，窗口外历史事件不得污染统计结果
- “最近 24 小时统计”与“当前设备/当前 vault 最新状态”是两类语义：前者是时间窗口聚合，后者由最新有效事件或稳定摘要字段判定，不能互相替代
- 对离线补报、重复重试、乱序到达事件，需保证同一幂等事件不会重复计入统计，且合法新事件不会被窗口外旧事件吞掉
- 当服务端摘要与当前设备本地运行态冲突时，跨设备事实（最近 commit / pull / restore / conflict 摘要）以服务端为准；当前设备尚未上报的瞬时状态以本地为补充，UI 必须能区分“服务端已确认”与“本地暂存”
- 诊断面板读取时同时消费服务端摘要与本地 IPC 运行态，并以服务端聚合摘要作为跨设备唯一真相源、本地运行态作为当前设备补充视角

### Restore + Pending Change Rule

快照 restore 需要明确与当前设备本地待提交变更的关系，避免恢复能力本身造成数据语义歧义：

- restore 不得静默清空当前设备已有的 pending queue、conflict record 或本地历史
- 若当前 vault 仍有未提交本地变更，桌面端必须在发起 `POST /snapshots/:id/restore` 前基于当前设备本地 pending queue 做预检、给出明确提示，并要求用户显式确认继续；服务端不负责猜测当前设备尚未上报的本地状态
- 用户确认后，restore 只会在服务端创建可追踪任务并生成后续 `restore commit`；当前设备已有 pending change 继续保留，后续与 restore 结果一并沿普通同步主链路收敛
- restore 任务完成后生成的 `restore commit` 继续走普通同步主链路；当前设备后续产生的本地改动继续按普通 pending change 提交流程处理
- 若 restore 与后续本地改动形成新的 head 冲突，仍沿用既有冲突处理机制，而不是偷偷覆盖其一

### Scheduler Safety Rule

后台任务是本阶段最容易引入破坏性行为的部分，因此计划必须显式要求：

- cleanup / snapshot / restore 任务都必须具备幂等语义，重复触发不能造成重复删除、重复 restore commit 或状态错乱
- tombstone / orphan cleanup 的自动触发、补偿重试与未来手动触发必须走统一调度入口，复用同一 canonical cleanup 路径
- 同一 vault 的高风险任务至少需要基本互斥，避免并发 cleanup 与 restore 相互踩踏
- 任务失败必须可观测：要写 logger / audit，并保留最近错误与下一次重试信息
- 后台任务部分失败时不得把系统留在“已删除数据但未更新元数据”的中间态；必要时应显式补偿或保持未完成状态等待重试

### Cross-phase Invariants

Phase 4 新增成本、恢复、运维能力时，仍必须继续满足前序 phase 已固定下来的底线：

- `logout -> DISABLED` 语义不变；退出登录或关闭同步不会清空本地 pending queue
- 诊断、快照、恢复、清理相关运行态仍按 `vaultId` / `deviceId` 隔离，不得跨 vault 串扰
- 新设备或本地缓存丢失后的恢复底线仍然是 `pull + blob-download-url`，snapshot 只能作为增强能力，不能取代基础重建路径

---

## 服务端新增重点

### 后台任务

建议在 `apps/server/src/services/scheduler.service.ts` 或等价调度服务中管理：

- orphan blob cleanup
- tombstone retention cleanup
- snapshot create / expire
- audit log retention（可选）

### 诊断 API

| API | 方法 | 说明 |
|---|---|---|
| `/api/v1/sync/diagnostics?vaultId=` | GET | 同步诊断信息（含自动/手动触发、离线状态、最近重试） |
| `/api/v1/sync/diagnostics/events` | POST | 客户端上报同步运行时事件（trigger、离线、恢复、重试） |
| `/api/v1/snapshots` | GET | 快照列表 |
| `/api/v1/snapshots` | POST | 创建快照 |
| `/api/v1/snapshots/:id` | GET | 查询快照 / restore 任务状态 |
| `/api/v1/snapshots/:id/restore` | POST | 触发恢复 |
| `/api/v1/devices` | GET | 当前用户设备状态 |

### 新增 API Contract 基线

为避免 Phase 4 做完功能却无法稳定联调，以下 contract 必须在本阶段明确下来：

- `GET /api/v1/snapshots/:id` 必须返回稳定的任务状态枚举、结果摘要、失败原因、最终 `commitSeq`（如适用）与最近更新时间，供客户端轮询
- snapshot / restore 任务状态至少固定为 `pending` / `running` / `succeeded` / `failed` 四态；只有 `succeeded` / `failed` 允许作为终态对外暴露，后续若扩展新状态必须先更新 DTO 与验收口径
- `GET /api/v1/sync/diagnostics` 必须稳定返回最近触发源、最近失败请求上下文、离线开始/恢复时间、重试次数、下次重试时间等字段
- `POST /api/v1/sync/diagnostics/events` 必须接受并持久化 `trigger`、`retryCount`、`offlineStartedAt`、`recoveredAt`、`nextRetryAt`、`requestId`、`deviceId` 等上下文
- runtime event 写入必须定义稳定的幂等 / 去重 / 补报语义，保证离线积压事件恢复上报、重复重试或乱序补报不会把诊断面板污染成多套相互矛盾的“当前状态”
- `snapshots`、`diagnostics`、`devices` 相关接口都必须继续执行 `currentUserId + vaultId` 或 `currentUserId + deviceId` 归属校验，不能只凭资源 ID 访问
- 除注册 / 登录外，`GET /api/v1/snapshots`、`GET /api/v1/snapshots/:id`、`GET /api/v1/sync/diagnostics`、`GET /api/v1/devices` 等新增读接口也必须继续沿用 `X-Request-Id`、`X-Device-Id` 到 request context / audit context；缺失必需请求头时返回稳定 `400/422` 语义，避免读写链路的 request / audit context 分叉
- `POST /api/v1/snapshots`、`POST /api/v1/snapshots/:id/restore`、`POST /api/v1/sync/diagnostics/events` 等新增写接口若缺失 `X-Request-Id` / `X-Device-Id`，或 body 中同名字段与 header 冲突，必须返回稳定 `400/422` 语义，不得静默补值或拆分审计上下文
- 上述新增入口继续沿用 `X-Request-Id`、`X-Device-Id` 到 request context / audit context

---

## Target Files

```text
apps/server/src/services/
├── snapshot.service.ts
├── blob.service.ts
├── audit.service.ts
├── metrics.service.ts
├── scheduler.service.ts
└── diagnostics.service.ts

apps/server/src/controllers/v1/
├── snapshot.controller.ts
├── device.controller.ts
└── sync.controller.ts

apps/server/src/db/schema/
├── snapshots.ts
├── sync-audit-logs.ts
├── sync-runtime-events.ts
└── blobs.ts

packages/core/src/sync/
├── gc.ts
├── snapshot.ts
├── metrics.ts
└── service.ts

apps/client/src/main/ipc/*
apps/render/src/ipc/*
apps/render/src/services/*
apps/render/src/components/*
apps/render/src/pages/settings/*
```


---

## Definition of Done

Phase 4 只有在以下条件全部满足时才可视为完成：

- 本地旧版本缓存可按策略清理，不误删当前 head 所需内容
- 服务端 orphan blob 只会清理未被引用且超过安全窗口的对象，`blob-upload-url -> commit` 的短暂 orphan window 由后续 cleanup 安全回收
- 删除 tombstone 存在明确保留窗口，且设备 cursor / 引用保护条件未满足时不会越权清理
- tombstone / orphan cleanup 的自动触发、补偿重试与未来手动触发都复用同一 canonical cleanup 路径，`BlobService` 与 `SchedulerService` 职责边界清晰
- 用户可在桌面端创建快照、查看快照、恢复快照，并轮询 restore 任务状态
- restore 不会静默清空当前设备 pending queue；存在未提交本地变更时会由桌面端先提示并确认，服务端仅负责任务化执行
- restore diff 为空时仍返回成功，但可不生成新 commit，且 DTO / 状态查询语义稳定
- 服务端有审计日志与关键同步指标
- 用户或开发者可在 renderer 诊断面板看到最近同步诊断信息，且三层诊断模型的字段 contract、24h 统计边界（`occurredAt >= now - 24h`）与真相源边界已固定
- 新设备或本地缓存丢失后，在 GC / snapshot / cleanup 机制叠加下仍可仅依赖 `pull + blob-download-url` 完成重建

---

## Tasks

### Task 30: 扩展 dto 成本与诊断类型

**Files:**
- `packages/dto/src/sync.ts`

- [ ] 增加 `GcConfig` / `GcResult`
- [ ] 增加 `SnapshotConfig` / `SnapshotRecord` / `SnapshotRestoreResult`
- [ ] 增加 `TombstoneRetentionConfig` / `TombstoneCleanupResult`
- [ ] 增加 `SyncMetricsSnapshot`
- [ ] 增加 `SyncDiagnostics`
- [ ] 增加 `SyncRuntimeEvent` / `SyncRuntimeEventAck`
- [ ] `SnapshotRecord` / restore DTO 明确任务状态枚举、失败原因、最终 `commitSeq`、更新时间等轮询必需字段
- [ ] snapshot / restore 最小状态枚举固定为 `pending` / `running` / `succeeded` / `failed`，并明确终态语义与重复 restore 时的返回 contract
- [ ] restore 结果 DTO 与状态查询字段需稳定表达“diff 为空但成功”的 no-op 语义（例如 `commitSeq` 为空且结果摘要可判定）
- [ ] `SyncDiagnostics` 需覆盖最近触发源、离线原因、下次重试信息，以及最近失败请求的 `requestId` / `deviceId`
- [ ] `SyncDiagnostics` 若返回最近 24 小时统计，必须显式以 `occurredAt >= now - 24h` 为时间下界，避免窗口外旧事件污染
- [ ] `SyncRuntimeEvent` / `SyncRuntimeEventAck` 需明确稳定幂等键（如 `vaultId + deviceId + requestId + eventType` 或等价 contract）、去重与离线补报语义，不能仅靠 24h 模糊查重

### Task 31: 本地 GC

**Files:**
- `packages/core/src/sync/gc.ts`
- `packages/core/src/sync/__tests__/gc.test.ts`

- [ ] 仅清理本地 blob cache 与旧 revision 缓存
- [ ] 永远保留当前 head 需要的内容
- [ ] 输出回收字节数、清理条目数、错误列表

### Task 32: 服务端 SnapshotService

**Files:**
- `apps/server/src/services/snapshot.service.ts`
- `apps/server/src/controllers/v1/snapshot.controller.ts`
- `apps/server/src/db/schema/snapshots.ts`

- [ ] 为指定 vault 触发快照创建
- [ ] 创建 / 查询 / 恢复都必须校验当前用户对目标 vault / snapshot 的归属
- [ ] 快照 key 必须落在当前用户当前 vault 的 prefix
- [ ] snapshot 内容边界必须与主同步链路一致，只覆盖 vault 内除 `.aimo-note/**` 外的文件；不得把内部元数据目录打入 snapshot blob 或 restore 结果
- [ ] 记录 snapshot 元数据与状态
- [ ] snapshot 元数据至少固定 `baseSeq`、`sizeBytes`、`restoredCommitSeq`、`finishedAt`，避免列表、恢复追踪与排障时 contract 漂移
- [ ] 支持列表、单项状态查询与恢复触发
- [ ] `GET /snapshots/:id` 返回稳定状态枚举、结果摘要、失败原因、最终 commitSeq（如适用）与更新时间
- [ ] restore diff 非空时写入可被其他设备 `pull` 到的 `restore commit`
- [ ] restore diff 为空时返回成功但可不生成 commit，并在状态查询中稳定表达 no-op 结果
- [ ] restore 生成的 `restore commit` 必须继续遵守主同步链路的文件边界；其他设备 `pull` 后不得看到 `.aimo-note/**` 内容被重新带回
- [ ] 记录 restore 任务状态、结果摘要与最终 commitSeq（如适用）
- [ ] 服务端 restore 入口不猜测当前设备本地 pending 状态；相关预检与用户确认由桌面端在调用前完成
- [ ] 用户在桌面端预检提示中取消 restore 时，不得创建 restore 任务，也不得改写 snapshot / restore 状态
- [ ] 同一 snapshot 或同一 vault 上重复触发 restore 时，必须返回已有进行中任务或稳定冲突语义，不能生成重复 restore commit 或重复任务记录
- [ ] 当前设备存在未提交本地变更时，桌面端 restore 入口需给出明确提示；无论用户如何选择，都不得静默清空 pending queue

### Task 33: 服务端 Blob 与 Tombstone 清理策略

**Files:**
- `apps/server/src/services/blob.service.ts`
- `apps/server/src/services/scheduler.service.ts`

- [ ] 增加 orphan blob 判定逻辑
- [ ] 明确 `blob-upload-url -> commit` 的短暂 orphan window：仅回收超过安全窗口且仍未被 commit 引用的对象，presigned URL expiry 可作为自然边界之一
- [ ] `ref_count = 0` 只作为候选过滤条件；删除前必须再次校验 `sync_file_heads`、历史 revision、snapshot 等真实引用，不能盲信计数
- [ ] 仅清理 `ref_count = 0` 且超过保留窗口的 blob
- [ ] 增加 tombstone retention cleanup，且安全条件至少同时包含保留窗口、所有未吊销设备 cursor 判定与引用保护
- [ ] tombstone / orphan cleanup 的自动触发、补偿重试与未来手动触发必须复用同一条 canonical cleanup 路径
- [ ] 任一未吊销设备的 `lastPulledSeq` 未越过目标 tombstone 时，清理任务必须跳过该记录
- [ ] 本阶段不引入服务端历史 revision 裁剪；任何仍可由 `history` API 返回的 revision 都必须继续能换取 blob 引用并完成 rollback
- [ ] 清理动作写审计日志
- [ ] 发现 `refCount` 与真实引用不一致时记录告警 / 审计并跳过删除，避免误删
- [ ] 不得删除仍被 revision、snapshot 或当前 head 引用的内容

### Task 34: 审计与指标

**Files:**
- `apps/server/src/services/audit.service.ts`
- `apps/server/src/services/metrics.service.ts`
- `apps/server/src/db/schema/sync-audit-logs.ts`

- [ ] 至少记录 `user.register`、`user.login`、`vault.create`、`device.register`、`sync.commit`、`sync.pull`、`sync.ack`、`sync.conflict`、`snapshot.create`、`snapshot.restore`
- [ ] 审计记录必须带上 `userId`、`vaultId`、`deviceId`、`requestId`
- [ ] 至少产出 `commit_success_total`、`commit_conflict_total`、`commit_fail_total`、`pull_success_total`、`blob_upload_request_total`、`blob_existing_hit_total`、`ack_total`、`snapshot_create_total`
- [ ] 区分自动同步、手动同步、离线恢复重试等触发来源
- [ ] 聚合同步请求日志与客户端 runtime event，沉淀离线持续时长、重试次数、最近一次恢复成功时间等关键诊断字段
- [ ] 支持按 userId / vaultId 查询最近诊断摘要

### Task 35: 诊断接口与用户可见面板

**Files:**
- `apps/server/src/services/diagnostics.service.ts`
- `apps/server/src/controllers/v1/sync.controller.ts`
- `apps/client/src/main/ipc/*`
- `apps/render/src/ipc/*`
- `apps/render/src/services/*`
- `apps/render/src/components/*`
- `apps/render/src/pages/settings/*`

- [ ] 提供 `getSyncDiagnostics(vaultId)`
- [ ] 提供 `recordSyncRuntimeEvent()`，把 trigger / offline / recovered / retry 等客户端运行态写入服务端诊断模型
- [ ] `recordSyncRuntimeEvent()` 必须直接复用 Phase 2 已冻结的 `trigger`、`retryCount`、`offlineStartedAt`、`recoveredAt`、`nextRetryAt`、`requestId`、`deviceId` 字段 contract
- [ ] `recordSyncRuntimeEvent()` 需定义稳定幂等键（如 `vaultId + deviceId + requestId + eventType` 或等价 contract）、去重规则与离线补报语义；同一轮离线恢复、自动重试或重复上报不会写出互相矛盾的当前态
- [ ] runtime event 去重不能仅靠“最近 24 小时相似事件”，必须以幂等键 + 明确补报语义为主
- [ ] `getSyncDiagnostics(vaultId)` 若返回最近 24 小时统计，必须显式以 `occurredAt >= now - 24h` 作为时间下界，防止窗口外旧事件污染
- [ ] `diagnostics` / `diagnostics/events` 必须校验当前用户对目标 vault / device 的归属
- [ ] 诊断接口返回结构需稳定覆盖最近 commit、最近 pull、最近失败、最近冲突、最近设备状态
- [ ] 当服务端诊断摘要与本地运行态同时存在时，明确并实现字段裁决规则：跨设备事实以服务端为准，当前设备未上报的瞬时状态以本地补充，前端可区分两类来源
- [ ] 展示当前是否处于 `OFFLINE`、最近同步触发源、最近一次自动重试时间
- [ ] 展示最近一次联网恢复后是否自动收敛成功
- [ ] 诊断摘要可追到最近失败请求的 `requestId` / `deviceId`
- [ ] renderer 通过 IPC 同时读取服务端诊断摘要与当前设备本地运行态
- [ ] 在 renderer 提供明确入口的诊断面板，而不只是完成 IPC 接线
- [ ] 诊断面板至少展示最近一次同步结果、耗时、上传 / 下载字节数、失败原因、离线开始时间、恢复时间、重试次数、下次重试时间

### Task 35A: 快照桌面端闭环

**Files:**
- `packages/core/src/sync/snapshot.ts`
- `apps/client/src/main/ipc/*`
- `apps/render/src/ipc/*`
- `apps/render/src/services/*`
- `apps/render/src/components/*`
- `apps/render/src/pages/settings/*`

- [ ] 提供创建快照、查询快照列表、查看单项状态、触发 restore 的桌面端调用链路
- [ ] renderer 提供快照列表、创建入口、恢复入口与 restore 进度 / 状态展示
- [ ] 用户取消 restore 确认时，renderer 不发起 restore 请求，并保留当前 pending queue 与界面状态
- [ ] restore 任务支持轮询，避免用户只能依赖列表页猜测是否完成
- [ ] 快照与 restore 失败原因在界面上可见，并可关联到最近请求上下文
- [ ] 同一 snapshot 被重复点击 restore 时，界面复用已有任务状态或给出稳定提示，不出现重复任务 / 重复恢复结果

### Task 36: 服务端调度器

**Files:**
- `apps/server/src/services/scheduler.service.ts`
- `apps/server/src/app.ts`

- [ ] 启动时注册清理与快照任务
- [ ] 为诊断面板预留同步重试调度信息的采集点
- [ ] 失败不阻塞主服务启动
- [ ] cleanup / snapshot / restore 任务具备基本幂等语义，重复触发不会造成重复删除或重复 restore commit
- [ ] orphan / tombstone cleanup 的自动触发、补偿重试与未来手动触发都通过统一调度入口，复用同一 canonical cleanup 路径
- [ ] `BlobService` 只提供单次清理执行能力；调度、互斥、失败重试与观测由 `SchedulerService` 统一负责
- [ ] 同一 vault 的高风险任务具备最小互斥或串行化约束，避免并发 cleanup 与 restore 相互踩踏
- [ ] cleanup / restore 任一步骤部分失败时，要么完成显式补偿，要么保留可重试未完成状态；不得留下“对象已删但元数据未更新”等半成状态
- [ ] 任务失败可观测，并保留最近错误、重试信息或未完成状态，避免静默失败
- [ ] 任务日志接入统一 logger / audit

---

## Acceptance Tests

### 服务端

- [ ] orphan blob 清理不会删除仍被 revision、snapshot 或当前 head 引用的内容
- [ ] 即使 `refCount` 漂移，cleanup 也不会仅凭计数误删仍被真实引用的 blob
- [ ] tombstone retention 窗口内，长期离线设备重新上线不会复活已删除文件
- [ ] 任一未吊销设备的 `lastPulledSeq` 未越过目标 tombstone 时，cleanup 不会错误清理该删除记录
- [ ] snapshot 创建后可在列表中查询到
- [ ] snapshot / restore / diagnostics / devices 等新增接口均校验当前用户归属，不能通过伪造 `vaultId`、`snapshotId`、`deviceId` 越权访问
- [ ] 新增读写接口在缺失必需的 `X-Request-Id` / `X-Device-Id`、或 body 中同名字段与 header 冲突时，返回稳定 `400/422` 语义，且 request context / audit context 不分叉
- [ ] snapshot restore 任务状态可追踪，并在完成后生成普通设备可 `pull` 的恢复结果
- [ ] snapshot create / restore 不会把 `.aimo-note/**` 重新带回跨设备同步主链路
- [ ] `GET /snapshots/:id` 返回稳定状态字段、失败原因与最终 `commitSeq`
- [ ] snapshot / restore 任务状态只使用计划中冻结的最小枚举，终态与重复 restore 的返回语义稳定可预测
- [ ] 新增写接口在缺失 `X-Request-Id` / `X-Device-Id` 或与 body 中同名字段冲突时，返回稳定 `400/422` 语义，且 request context / audit context 不分叉
- [ ] 同一 vault 上重复触发 cleanup / snapshot / restore 不会造成重复删除、重复 restore commit 或状态错乱
- [ ] 对 cleanup / restore 注入部分失败后，不会留下“对象已删但元数据未更新”或“restore commit 已写入但任务状态未收敛”的半成状态；系统要么完成补偿，要么保留可重试失败态
- [ ] 同一 vault 的高风险任务不会无约束并发执行，避免 cleanup 与 restore 相互踩踏
- [ ] 诊断 API 能返回最近同步摘要、关键请求上下文，以及最近一次 runtime event 上报内容
- [ ] diagnostics 的最近 24 小时统计只统计 `occurredAt >= now - 24h` 的事件，窗口外旧事件不会污染统计
- [ ] runtime event 去重依赖稳定幂等键与补报语义，而不是仅靠 24h 模糊查重；离线补报、重复重试、乱序到达不会写出矛盾当前态
- [ ] `blob-upload-url -> commit` 的短暂 orphan window 可被容忍，超过安全窗口后 orphan cleanup 会回收未引用对象
- [ ] tombstone / orphan cleanup 的自动执行、补偿重试与手动触发复用同一 canonical cleanup 路径，不绕过统一调度互斥与观测
- [ ] restore diff 为空时，接口仍返回成功且不产生额外 restore commit，状态查询可稳定识别该 no-op 结果
- [ ] 新增入口写入的审计 / request context 能稳定关联 `requestId`、`deviceId`

### 客户端 + 前端

- [ ] 本地运行 GC 后，旧缓存被清理，但当前历史功能仍可使用
- [ ] GC / cleanup 运行后，当前 head 对应文件仍可被本地搜索 / 索引命中，不因成本优化破坏本地优先体验
- [ ] snapshot restore 完成后，另一台设备通过普通 pull 即可收敛到恢复后的状态
- [ ] 用户可在桌面端看到快照列表、restore 状态与失败原因，并主动触发恢复
- [ ] 用户在 restore 确认步骤取消后，不会创建 restore 任务，也不会改变当前 pending queue / 快照状态
- [ ] 当前设备存在未提交本地变更时，桌面端会在调用 restore API 前完成本地预检、给出明确提示，且 restore 不会静默清空 pending queue
- [ ] 用户确认带着本地 pending change 继续 restore 后，pending queue 仍保留；后续若与 `restore commit` 形成 head 冲突，系统沿用既有冲突链路而不是静默覆盖
- [ ] snapshot create / restore 不会把 `.aimo-note/**` 重新带回跨设备同步主链路
- [ ] 新设备或清空本地 blob cache 后，在启用 GC、snapshot、orphan cleanup、tombstone retention 后，仍可仅依赖远端 `pull + blob-download-url` 完成内容重建
- [ ] 启用 GC / cleanup 后，只要历史面板仍展示某个 revision，用户就仍可读取其内容并完成 rollback，不会因后台清理而失效
- [ ] 诊断面板能看到最近一次同步结果、耗时、字节数与失败原因
- [ ] 诊断面板能区分自动同步、手动同步、离线恢复重试，并显示当前离线状态
- [ ] 同步关闭或离线期间，诊断面板仍可展示当前设备本地记录的待处理信息；恢复联网并重新开启同步后，服务端摘要继续作为跨设备唯一真相源
- [ ] 当服务端诊断摘要与本地运行态冲突时，诊断面板对跨设备事实采用服务端结果，对当前设备瞬时状态采用本地补充，并能区分来源
- [ ] 诊断面板能看到最近一次离线开始时间、恢复时间、重试次数、下次重试时间
- [ ] 用户可查看设备最近同步状态与异常提示

---

## Exit Criteria

满足以下条件即可认为服务端协调方案完整落地：

- `apps/server` 已具备长期运行所需的 auth、sync、snapshot、audit、diagnostics 能力
- 本地优先、多设备同步、用户隔离、冲突保留、版本回溯均可工作
- 用户可从桌面端触发快照创建 / 恢复，并看到 restore 任务状态
- 自动同步、手动兜底同步、离线恢复重试的运行状态可被诊断与审计
- 用户或开发者能够明确看见同步是否因离线而暂停、何时恢复、是否已经自动补齐
- tombstone retention、orphan cleanup、snapshot restore 已形成可验证的安全策略
- 后台任务具备基本幂等、互斥与失败可观测能力，不会因重复调度破坏数据一致性
- 成本与恢复策略已经覆盖真实运行场景
