# Vault Sync Phase 3: Conflict Handling + Version Rollback

> **Goal:** 在 Phase 2 的 `apps/server + MySQL + auth + 自动同步 happy path` 基础上，补齐冲突闭环、历史查询、版本回溯，以及用户可见的手动合并流程。

## Phase 3 Scope

本阶段围绕两条线展开：

- **服务端线**：补齐冲突摘要与历史查询 API
- **客户端/前端线**：落地冲突副本、手动合并、历史面板、rollback

### 本阶段必须交付

- 服务端 `head_mismatch` 冲突响应标准化
- `sync_conflicts` 摘要查询 API
- 历史 revision 查询 API
- 客户端冲突记录与 conflict copy 文件落盘
- renderer 显示未解决冲突
- rollback 通过普通 commit 再传播给其他设备
- rollback / resolve 结果能够接入自动同步引擎，而不是依赖用户手动 push / pull
- 本地没有目标 revision 缓存时，仍可通过远端 blob 下载完成恢复

### 本阶段明确不做

- 自动三方文本合并
- 实时协同编辑
- 团队成员权限冲突仲裁

---

## 服务端职责

### 新增或强化的 API

| API | 方法 | 说明 |
|---|---|---|
| `/api/v1/sync/conflicts?vaultId=` | GET | 获取当前用户当前 vault 的冲突摘要 |
| `/api/v1/sync/history?vaultId=&filePath=` | GET | 获取文件历史 revision |
| `/api/v1/sync/history/blob?vaultId=&revision=` | GET | 获取历史 revision 对应 blob 引用 |
| `/api/v1/sync/blob-download-url` | POST | 为历史 / pull 的 blob 引用换取短期下载地址 |
| `/api/v1/sync/conflicts/:id/resolve` | POST | 标记服务端冲突摘要已解决（可选） |

### 服务端定位

- 服务端只负责判断冲突、保存摘要、暴露历史元数据
- 服务端需要提供历史 blob 引用，并允许客户端进一步换取下载地址以支持无缓存 rollback
- 不负责替用户完成文本合并
- rollback 最终仍通过客户端生成新的 commit 来传播

### 接口语义补充

- `conflicts`、`history`、`history/blob`、`conflicts/:id/resolve` 等新增同步入口，继续沿用 `X-Request-Id`、`X-Device-Id` 到 request context / audit context
- 上述新增入口若缺失必需的 `X-Request-Id` / `X-Device-Id`，或 `resolve` body 中同名字段与 header 不一致，必须返回稳定 `400/422` 语义，不得静默补值或拆分幂等 / 审计上下文
- `conflicts/:id/resolve` 必须同时校验 `currentUserId + vaultId + conflictId` 归属，且重复 resolve 应保持幂等
- `history/blob` 与 rollback 相关调用需定义稳定异常语义：`revision_not_found`、`blob_not_visible`、下载 URL 过期 / 下载失败等，避免客户端各自猜测错误来源

### Canonical Conflict Contract

为避免 commit 冲突响应、服务端落库摘要与本地辅助记录在 Phase 3 再次分叉，本阶段强制约束：

- `packages/dto/src/sync.ts` 中的 `ServerConflict` 是跨端共享的 canonical transport contract
- `sync_conflicts` 是服务端对 `ServerConflict` 的稳定持久化投影，可额外带 `vaultId`、`userId`、`losingDeviceId`、`resolvedAt` 等服务端 bookkeeping 字段，但不得改写共享字段含义
- `SyncConflictRecord` 是客户端本地辅助投影，必须直接复用 `ServerConflict` 的共享字段，并只额外补充 `conflictCopyPath`、本地解决意图等当前设备视角字段
- 任何字段改名或语义扩展必须先改 `packages/dto/src/sync.ts`，再同步更新服务端 schema 与客户端映射；禁止在 controller / service / renderer 私自发明别名

---

## 客户端职责

- commit 冲突时保留 pending change
- 拉取远端最新 head 内容
- 生成 `*_conflict_*.md` 文件
- UI 展示冲突列表与操作入口
- 允许用户查看历史 revision 并恢复
- rollback 后写入本地 queue，沿自动同步链路提交；必要时也可由设置页“立即同步”立即触发

---

## Target Files

```text
apps/server/src/controllers/v1/
├── sync.controller.ts

apps/server/src/services/
├── conflict.service.ts
├── history.service.ts
├── sync-commit.service.ts
└── sync-pull.service.ts

apps/server/src/db/schema/
└── sync-conflicts.ts

packages/core/src/sync/
├── conflicts.ts
├── rollback.ts
├── history.ts
├── service.ts
└── engine.ts

apps/client/src/main/ipc/*
apps/render/src/ipc/*
apps/render/src/services/*
apps/render/src/components/*
apps/render/src/pages/editor/*
```

---

## Definition of Done

Phase 3 只有在以下条件全部满足时才可视为完成：

- `commit` 冲突时服务端返回标准化 `ServerConflict[]`
- 服务端可以按用户 + vault 查询冲突摘要与历史记录
- 客户端会生成 conflict copy，且不丢本地修改
- renderer 无需进入设置页即可看到冲突
- 用户无需进入设置页即可查看历史 revision 并执行 rollback
- 同步关闭时，rollback / resolve 只更新本地状态与 queue，不会偷偷绕过 `DISABLED` 语义发起远端请求
- rollback 通过普通同步链路传播到其他设备

---

## Tasks

### Task 22: 扩展 dto 冲突与历史协议

**Files:**
- `packages/dto/src/sync.ts`

- [ ] 增加 `SyncConflictRecord`
- [ ] 增加 `SyncHistoryEntry`
- [ ] 增加 `RollbackRequest` / `RollbackResult`
- [ ] 明确 `ServerConflict` 字段：`actualHeadRevision`、`remoteBlobHash`、`winningCommitSeq`
- [ ] 将 `packages/dto/src/sync.ts` 中的 `ServerConflict` 明确标注为跨端 canonical contract，并约束后续扩展只能从这里出发
- [ ] 明确 `SyncConflictRecord` / `sync_conflicts` 与 `ServerConflict` 的字段映射，保证 commit 冲突响应、服务端落库摘要与后续查询接口复用同一组核心语义

### Task 23: 服务端 ConflictService

**Files:**
- `apps/server/src/services/conflict.service.ts`
- `apps/server/src/controllers/v1/sync.controller.ts`

- [ ] 记录冲突摘要到 `sync_conflicts`
- [ ] 在 `sync.controller.ts` 暴露 `GET /api/v1/sync/conflicts?vaultId=`，稳定返回当前用户当前 vault 的未解决冲突摘要
- [ ] 按 `userId + vaultId` 查询未解决冲突
- [ ] 提供按冲突 ID 标记 resolved 的接口（摘要态）
- [ ] 服务端保存的冲突摘要是跨设备同步语义的唯一真相源，本地记录只能作为当前设备辅助视图与离线缓存
- [ ] `sync_conflicts` 落库字段必须是 `ServerConflict` 的稳定投影，而不是重新发明第二套冲突语义
- [ ] `resolve` 必须校验 `userId + vaultId + conflictId` 归属，不能仅凭冲突 ID 更新
- [ ] 重复 resolve 保持幂等，不因客户端重试产生状态抖动
- [ ] 返回值只暴露当前用户可见的冲突

### Task 24: 服务端 HistoryService

**Files:**
- `apps/server/src/services/history.service.ts`
- `apps/server/src/controllers/v1/sync.controller.ts`

- [ ] 按 `vaultId + filePath` 查询历史 revision
- [ ] 支持分页，避免超长历史一次返回
- [ ] 提供 revision -> blob 引用查询
- [ ] 返回结果可让客户端继续调用 `blob-download-url` 获取下载地址
- [ ] 对 `revision` 不存在、当前用户不可见、目标 blob 不可下载等情况返回稳定错误语义
- [ ] 所有查询先校验当前用户对 vault 的权限

### Task 25: 强化 SyncCommitService 冲突语义

**Files:**
- `apps/server/src/services/sync-commit.service.ts`

- [ ] head mismatch 时写冲突摘要
- [ ] 返回标准化冲突响应，而不是通用 500
- [ ] 不做部分提交
- [ ] 冲突响应字段、`sync_conflicts` 落库字段与 conflicts API 查询字段必须保持同一组核心语义
- [ ] 保持 requestId 幂等行为不变

### Task 26: 客户端 ConflictManager

**Files:**
- `packages/core/src/sync/conflicts.ts`
- `packages/core/src/sync/__tests__/conflicts.test.ts`

- [ ] 将服务端 `ServerConflict` 映射到本地 `sync_conflicts`
- [ ] 生成 `{basename}_conflict_{timestamp}_{random}.md`
- [ ] 记录 `conflict_copy_path`
- [ ] `resolve()` 记录用户的本地处理结果、解决意图与辅助诊断信息；在允许同步时再通过服务端摘要态幂等落库，不阻塞当前编辑流程
- [ ] 提供 `getUnresolved()`、`resolve()`

### 自动同步集成约束

- 冲突产生、冲突解决、rollback 都必须复用 Phase 2 的后台同步引擎，不能引入另一套手工 `push` / `pull` 流程。
- 断网期间允许继续查看历史、生成 rollback 的本地 pending change，并记录本地冲突处理过程；恢复联网后自动提交或把本地处理结果对账到服务端摘要态。
- 冲突 UX 应继续在编辑页等主界面暴露，不要求用户进入设置页才能感知异常。
- 出现冲突时必须由用户明确决定保留哪一版本或如何手动合并，系统不得静默替用户覆盖本地或远端版本。

### Cross-phase Invariants

本阶段新增冲突与回溯能力时，必须继续遵守 Phase 1 / Phase 2 已经固定下来的基础约束，避免局部闭环破坏主同步模型：

- `logout` 或用户手动关闭同步后，状态仍回到 `DISABLED`，但本地 conflict record、history cache、pending queue 不得被清空
- rollback / resolve 在 `DISABLED` 或 `OFFLINE` 状态下可以完成本地动作，但不得偷偷绕过开关直接发起网络同步
- 本地 conflict copy、解决意图与辅助诊断信息只代表当前设备视角，不能替代服务端冲突摘要作为跨设备同步语义的唯一真相源
- 所有冲突、历史、rollback 相关运行态仍必须按 `vaultId` 隔离，不能与其他 vault 串扰
- rollback 最终必须回到与普通本地编辑一致的 pending queue + 自动同步主链路，而不是形成单独的“恢复专用上传流程”
- conflict / rollback 相关运行态字段必须继续复用 Phase 2 已冻结的 `trigger`、`retryCount`、`offlineStartedAt`、`recoveredAt`、`nextRetryAt`、`requestId`、`deviceId` contract，避免为 Phase 4 diagnostics 再做字段迁移

### Task 27: 客户端 History + Rollback

**Files:**
- `packages/core/src/sync/history.ts`
- `packages/core/src/sync/rollback.ts`
- `packages/core/src/sync/__tests__/history.test.ts`
- `packages/core/src/sync/__tests__/rollback.test.ts`

- [ ] 拉取服务端历史 revision 列表
- [ ] 获取旧 revision 的 blob 引用
- [ ] 本地无缓存时通过 `blob-download-url` 下载 blob 内容
- [ ] 写回本地文件并生成新的 pending change
- [ ] 对下载 URL 过期、下载失败、目标 revision 不可见等异常提供稳定反馈与重试入口
- [ ] rollback 结果进入 pending queue 后由后台自动同步，必要时可被“立即同步”按钮显式触发
- [ ] rollback 发生在离线状态时也可先完成本地写回，待网络恢复后再继续同步
- [ ] 若当前 vault 处于 `DISABLED`，rollback 仍可先完成本地写回与入队；只有用户重新开启同步后才恢复网络提交流程
- [ ] 记录来源 `source=rollback`，并在后续同步请求中透传对应 trigger / runtime metadata，供 Phase 4 审计与诊断聚合使用

### Task 28: apps/client IPC 能力

**Files:**
- `apps/client/src/main/ipc/*`
- `apps/render/src/ipc/*`

- [ ] 暴露 `listConflicts()`、`resolveConflict()`、`openConflictCopy()`
- [ ] 暴露 `listHistory(filePath)`、`rollback(filePath, revision)`
- [ ] 暴露与自动同步引擎协同所需的触发接口，供冲突解决与 rollback 完成后立即请求同步
- [ ] 暴露当前设备最近 trigger、offlineStartedAt、nextRetryAt、retryCount 等本地运行态，供 Phase 4 诊断面板直接复用
- [ ] 文件系统相关动作仍然只在 client 层执行

### Task 29: renderer 冲突与回溯 UI

**Files:**
- `apps/render/src/services/*`
- `apps/render/src/components/*`
- `apps/render/src/pages/editor/*`

- [ ] 显示全局冲突 badge / banner
- [ ] 在当前笔记页显示未解决冲突列表
- [ ] 提供打开冲突副本、标记已解决入口
- [ ] 提供历史 revision 面板
- [ ] 在冲突 / rollback 操作附近展示“等待自动同步”或“当前离线，联网后自动继续”的状态提示
- [ ] 提供“恢复到该版本”入口与反馈状态

---

## Acceptance Tests

### 服务端

- [ ] `GET /api/v1/sync/conflicts?vaultId=` 可用，且只返回当前用户当前 vault 的冲突摘要
- [ ] 用户只能查询自己 vault 下的冲突摘要与历史记录
- [ ] `resolve conflict` 必须校验当前用户归属，重复 resolve 结果保持幂等
- [ ] 冲突响应结构稳定且包含最新远端 head 信息
- [ ] `commit` 冲突响应、`sync_conflicts` 查询结果与本地 `SyncConflictRecord` 映射后的核心字段保持一致，不存在第二套并行语义
- [ ] 历史查询支持分页且顺序正确
- [ ] `history/blob` 返回的 blob 引用只能换取当前用户可见的下载地址
- [ ] `revision_not_found`、`blob_not_visible`、下载 URL 过期等异常返回稳定语义
- [ ] `conflicts` / `history` / `history/blob` / `conflicts/:id/resolve` 缺失必需请求头，或 `resolve` body 与 header 的 `requestId` / `deviceId` 冲突时，返回稳定 `400/422` 语义，且 request context / audit context 不分叉

### 客户端 + 前端

- [ ] 两台设备并发修改同一文件时，后提交设备生成 conflict copy，不丢本地修改
- [ ] 同步完成后 renderer 能看到未解决冲突
- [ ] 用户可从 UI 打开冲突副本并手动标记 resolved
- [ ] 用户无需进入设置页即可在主界面查看历史 revision 并发起 rollback
- [ ] rollback 到旧 revision 后，本地文件内容更新且生成新的 pending change
- [ ] 本地无旧 revision 缓存时，仍可通过远端 blob 下载完成 rollback
- [ ] blob 下载失败或下载 URL 过期时，前端能给出明确失败原因并允许重试
- [ ] 断网期间触发 rollback 或 resolve 不阻塞本地操作，恢复联网后可自动继续同步
- [ ] 同步被用户显式关闭时，rollback / resolve 仅更新本地状态、queue 与本地处理记录，不会偷偷发起远端请求；重新开启同步后仍可继续提交
- [ ] 冲突场景下由用户明确选择保留哪一版本或如何手动合并；系统只记录过程并在允许同步时把结果对账到服务端摘要态
- [ ] 冲突或 rollback 后用户无需进入设置页手动同步，系统会自动继续处理
- [ ] 另一台设备 pull 后能看到 rollback 结果

---

## Exit Criteria

满足以下条件即可进入 Phase 4：

- 服务端异常路径与客户端 UX 路径都已闭环
- 用户可以真实处理冲突并恢复历史版本
- `ServerConflict`、`sync_conflicts` 摘要与前端消费字段已收敛为同一套 canonical contract，不会在 Phase 4 再拆分语义
- 冲突与 rollback 场景已经接入自动同步链路，而不是依赖手工同步
- 后续只需补成本、恢复、运维与后台任务能力
