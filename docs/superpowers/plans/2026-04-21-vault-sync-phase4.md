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

### Snapshot Restore Rule

snapshot restore 不是“直接把数据库状态改回去”，而应该：

- 创建可追踪的 restore 任务
- 完成后生成新的 `restore commit`
- 让其他设备继续通过普通 `pull` 收敛，而不是绕过同步主链路
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
- `GET /api/v1/sync/diagnostics` 必须稳定返回最近触发源、最近失败请求上下文、离线开始/恢复时间、重试次数、下次重试时间等字段
- `POST /api/v1/sync/diagnostics/events` 必须接受并持久化 `trigger`、`retryCount`、`offlineStartedAt`、`recoveredAt`、`nextRetryAt`、`requestId`、`deviceId` 等上下文
- `snapshots`、`diagnostics`、`devices` 相关接口都必须继续执行 `currentUserId + vaultId` 或 `currentUserId + deviceId` 归属校验，不能只凭资源 ID 访问
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
- 服务端 orphan blob 只会清理未被引用且超过安全窗口的对象
- 删除 tombstone 存在明确保留窗口，且设备 cursor / 引用保护条件未满足时不会越权清理
- 用户可在桌面端创建快照、查看快照、恢复快照，并轮询 restore 任务状态
- restore 不会静默清空当前设备 pending queue；存在未提交本地变更时会由桌面端先提示并确认，服务端仅负责任务化执行
- 服务端有审计日志与关键同步指标
- 用户或开发者可在 renderer 诊断面板看到最近同步诊断信息，且三层诊断模型的字段 contract 与真相源边界已固定
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
- [ ] `SyncDiagnostics` 需覆盖最近触发源、离线原因、下次重试信息，以及最近失败请求的 `requestId` / `deviceId`

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
- [ ] 记录 snapshot 元数据与状态
- [ ] 支持列表、单项状态查询与恢复触发
- [ ] `GET /snapshots/:id` 返回稳定状态枚举、结果摘要、失败原因、最终 commitSeq（如适用）与更新时间
- [ ] restore 完成后写入可被其他设备 `pull` 到的 `restore commit`
- [ ] 记录 restore 任务状态、结果摘要与最终 commitSeq（如适用）
- [ ] 服务端 restore 入口不猜测当前设备本地 pending 状态；相关预检与用户确认由桌面端在调用前完成
- [ ] 当前设备存在未提交本地变更时，桌面端 restore 入口需给出明确提示；无论用户如何选择，都不得静默清空 pending queue

### Task 33: 服务端 Blob 与 Tombstone 清理策略

**Files:**
- `apps/server/src/services/blob.service.ts`
- `apps/server/src/services/scheduler.service.ts`

- [ ] 增加 orphan blob 判定逻辑
- [ ] `ref_count = 0` 只作为候选过滤条件；删除前必须再次校验 `sync_file_heads`、历史 revision、snapshot 等真实引用，不能盲信计数
- [ ] 仅清理 `ref_count = 0` 且超过保留窗口的 blob
- [ ] 增加 tombstone retention cleanup，且安全条件至少同时包含保留窗口、所有未吊销设备 cursor 判定与引用保护
- [ ] 任一未吊销设备的 `lastPulledSeq` 未越过目标 tombstone 时，清理任务必须跳过该记录
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
- [ ] `diagnostics` / `diagnostics/events` 必须校验当前用户对目标 vault / device 的归属
- [ ] 诊断接口返回结构需稳定覆盖最近 commit、最近 pull、最近失败、最近冲突、最近设备状态
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
- [ ] restore 任务支持轮询，避免用户只能依赖列表页猜测是否完成
- [ ] 快照与 restore 失败原因在界面上可见，并可关联到最近请求上下文

### Task 36: 服务端调度器

**Files:**
- `apps/server/src/services/scheduler.service.ts`
- `apps/server/src/app.ts`

- [ ] 启动时注册清理与快照任务
- [ ] 为诊断面板预留同步重试调度信息的采集点
- [ ] 失败不阻塞主服务启动
- [ ] cleanup / snapshot / restore 任务具备基本幂等语义，重复触发不会造成重复删除或重复 restore commit
- [ ] 同一 vault 的高风险任务具备最小互斥或串行化约束，避免并发 cleanup 与 restore 相互踩踏
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
- [ ] snapshot restore 任务状态可追踪，并在完成后生成普通设备可 `pull` 的恢复结果
- [ ] `GET /snapshots/:id` 返回稳定状态字段、失败原因与最终 `commitSeq`
- [ ] 同一 vault 上重复触发 cleanup / snapshot / restore 不会造成重复删除、重复 restore commit 或状态错乱
- [ ] 同一 vault 的高风险任务不会无约束并发执行，避免 cleanup 与 restore 相互踩踏
- [ ] 诊断 API 能返回最近同步摘要、关键请求上下文，以及最近一次 runtime event 上报内容
- [ ] 新增入口写入的审计 / request context 能稳定关联 `requestId`、`deviceId`

### 客户端 + 前端

- [ ] 本地运行 GC 后，旧缓存被清理，但当前历史功能仍可使用
- [ ] snapshot restore 完成后，另一台设备通过普通 pull 即可收敛到恢复后的状态
- [ ] 用户可在桌面端看到快照列表、restore 状态与失败原因，并主动触发恢复
- [ ] 当前设备存在未提交本地变更时，桌面端会在调用 restore API 前完成本地预检、给出明确提示，且 restore 不会静默清空 pending queue
- [ ] 用户确认带着本地 pending change 继续 restore 后，pending queue 仍保留；后续若与 `restore commit` 形成 head 冲突，系统沿用既有冲突链路而不是静默覆盖
- [ ] 新设备或清空本地 blob cache 后，在启用 GC、snapshot、orphan cleanup、tombstone retention 后，仍可仅依赖远端 `pull + blob-download-url` 完成内容重建
- [ ] 诊断面板能看到最近一次同步结果、耗时、字节数与失败原因
- [ ] 诊断面板能区分自动同步、手动同步、离线恢复重试，并显示当前离线状态
- [ ] 同步关闭或离线期间，诊断面板仍可展示当前设备本地记录的待处理信息；恢复联网并重新开启同步后，服务端摘要继续作为跨设备唯一真相源
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
