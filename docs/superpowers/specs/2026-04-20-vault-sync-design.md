# Vault 同步方案设计

## 背景

AIMO-Note 需要一个长期稳定、支持版本回溯、数据同步方案简洁、成本低的本地优先笔记应用。

### 约束条件

- **同步目标**：S3 兼容存储（国内自建）
- **同步数据**：仅 vault 目录下的 .md 笔记文件
- **设备数量**：2-3 台设备
- **冲突策略**：保留双版本，用户手动合并
- **成本优先**：存储成本、流量成本最小化
- **本地能力**：SQLite 数据库存储元数据，支持检索

---

## 存储架构

### S3 存储布局

```
vault/
  └── .aimo/                    ← 同步元数据目录（不暴露给用户）
      ├── vault.db             ← SQLite 数据库（vault 元数据）
      ├── sync.lock            ← 文件锁（防止并发同步）
      ├── manifest.json        ← 全局清单快照（JSON，便于远程比对）
      ├── changelog.json       ← 变更日志（追加写）
      └── versions/           ← 文件版本存储
          ├── note1.md/
          │   ├── v1.json
          │   └── v1.content
          └── note2.md/
              ├── v1.json
              ├── v2.json
              └── v2.content
```

### SQLite 表结构

```sql
-- 设备注册表
CREATE TABLE devices (
  id TEXT PRIMARY KEY,           -- 设备唯一标识
  name TEXT,                    -- 设备名称 "MacBook Pro"
  last_seen TEXT,                -- 最后活跃时间
  created_at TEXT
);

-- 文件版本表
CREATE TABLE file_versions (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,      -- "note1.md"
  version TEXT NOT NULL,         -- "v1", "v2"
  hash TEXT NOT NULL,            -- sha256:abc123
  content_path TEXT NOT NULL,    -- versions/note1.md/v1.content
  created_at TEXT NOT NULL,
  device_id TEXT NOT NULL,
  message TEXT,                  -- "updated", "restored from v1"
  is_deleted INTEGER DEFAULT 0,  -- 软删除标记
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

-- 变更日志表（增量）
CREATE TABLE change_log (
  id INTEGER PRIMARY KEY,
  operation TEXT NOT NULL,       -- "upsert", "delete"
  file_path TEXT NOT NULL,
  version TEXT NOT NULL,
  hash TEXT,
  created_at TEXT NOT NULL,
  device_id TEXT NOT NULL,
  synced INTEGER DEFAULT 0       -- 是否已同步到远程
);

-- 同步状态表
CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,          -- "last_sync", "sync_token"
  value TEXT NOT NULL
);

-- 冲突记录表
CREATE TABLE conflicts (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  local_version TEXT NOT NULL,
  remote_version TEXT NOT NULL,
  local_hash TEXT NOT NULL,
  remote_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved INTEGER DEFAULT 0,
  resolution_path TEXT           -- 解决后的文件路径
);

-- 索引
CREATE INDEX idx_change_log_synced ON change_log(synced);
CREATE INDEX idx_change_log_created ON change_log(created_at);
CREATE INDEX idx_file_versions_path ON file_versions(file_path);
```

---

## 核心模块

| 模块 | 职责 | 对应文件 |
|------|------|----------|
| `FileWatcher` | chokidar 监听 vault，检测文件变更 | `sync/watcher.ts` |
| `ChangeLogger` | 将变更写入 SQLite change_log | `sync/logger.ts` |
| `SyncEngine` | 对比差异、解决冲突、执行同步 | `sync/engine.ts` |
| `S3Adapter` | S3 API 封装（PUT/GET/LIST/DELETE） | `sync/adapter.ts` |
| `VersionManager` | 版本创建、回溯、GC | `sync/versions.ts` |
| `ConflictResolver` | 冲突检测与解决策略 | `sync/conflicts.ts` |

---

## 同步流程

### 同步状态机

```
     ┌──────────┐
     │   IDLE   │  ← 正常编辑，chokidar 监听变更
     └────┬─────┘
          │ 文件变更
          ▼
     ┌──────────┐
     │  PENDING │  ← 变更写入本地 changelog
     └────┬─────┘
          │ 触发同步（定时/手动）
          ▼
     ┌──────────┐
     │ SYNCING  │  ← 执行同步协议
     └────┬─────┘
          │ 成功
          ▼
     ┌──────────┐
     │   IDLE   │  ← 更新 lastSync
     └──────────┘
```

### 同步协议（4 步）

**Step 1: 下载远程 changelog.json**
```
GET vault/.aimo/changelog.json
```

**Step 2: 对比差异**
- 本地 changelog 有，远程没有 → 待上传
- 远程 changelog 有，本地没有 → 待下载
- 双方都有但 hash 不同 → 冲突

**Step 3: 冲突处理**
- 检测到冲突：重命名本地文件为 `note1_conflict_*.md`
- 双方版本都保留到 versions/ 目录

**Step 4: 交换变更**

上传端：
- PUT `vault/.aimo/versions/note1.md/v{n}.content`
- PUT `vault/.aimo/versions/note1.md/v{n}.json`
- PUT `vault/.aimo/changelog.json`（追加 entries）
- PUT `vault/.aimo/manifest.json`（更新）

下载端：
- 对比 hash，只拉取本地没有的版本文件

---

## 冲突处理

### 冲突场景

```
设备A 修改 note1.md     设备B 同时修改 note1.md
      │                         │
      └──────────┬──────────────┘
                 ▼
        同步时检测到 hash 不匹配
                 │
                 ▼
        S3 存储两个版本:
        - note1.md (设备A版本)
        - note1_conflict_20260420_101530.md (设备B版本)

        本地 vault 保留当前设备版本
        冲突文件标记提醒用户手动合并
```

### 冲突解决策略

1. **检测**：同步时比对本地与远程的 hash
2. **保留**：双方版本都存入 versions/ 目录
3. **通知**：UI 层提示用户存在冲突文件
4. **合并**：用户手动编辑解决，触发新版本

---

## 版本回溯

### 回溯流程

```
用户请求：回溯 note1.md 到 v1

Step 1: 检查本地 versions/note1.md/v1.content 是否存在
        - 存在：直接恢复
        - 不存在：从 S3 下载 v1.content

Step 2: 读取 v1.content，写入 vault/note1.md

Step 3: 创建新版本 v4，记录回溯操作
        - versions/note1.md/v4.content = v1.content
        - changelog.json 新增 entry
```

### 回溯查询示例

```sql
-- 查询 note1.md 的所有版本（按时间倒序）
SELECT version, created_at, device_id, message
FROM file_versions
WHERE file_path = 'note1.md' AND is_deleted = 0
ORDER BY created_at DESC;

-- 查询某个时间点前的文件状态
SELECT fv.*, fd.content
FROM file_versions fv
JOIN file_descriptors fd ON fd.path = fv.file_path
WHERE fv.file_path = 'note1.md'
AND fv.created_at <= '2026-04-01T00:00:00Z'
ORDER BY fv.created_at DESC
LIMIT 1;
```

---

## 成本控制

| 操作 | 存储策略 | 流量策略 |
|------|----------|----------|
| 增量同步 | 仅存版本 diff | 仅传变更文件 |
| 全量快照 | 每日 1 次 tar.gz | 设备间传输 1 次/天 |
| 版本回溯 | 从 snapshots 拉取 | 按需下载指定版本 |
| 冲突保留 | 双版本都存 | 冲突文件双向传输 |
| GC 清理 | 定期删除旧版本 | 仅清理本地缓存 |

---

## 未来扩展

- **双链支持**：`file_versions` 可扩展存储笔记的出链/入链关系
- **全文搜索**：SQLite FTS5 支持笔记内容全文搜索
- **插件生态**：`change_log` 可作为插件系统的数据源

---

## 实现优先级

1. **Phase 1**：本地 SQLite + 文件监听 + 变更日志
2. **Phase 2**：S3 Adapter + 基础同步协议
3. **Phase 3**：冲突处理 + 版本回溯
4. **Phase 4**：GC 清理 + 成本优化
