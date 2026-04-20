# 图片持久化与编辑器图片能力重构技术方案

## 1. 背景

当前图片能力已实现“可调整尺寸并回写到 Markdown”，但在近期修复过程中暴露出结构性问题：

1. `MilkdownEditorInner.tsx` 体量过大（>1k 行），图片逻辑与 slash/table/滚动高亮耦合。
2. 图片状态管理（选择、位置、转换、持久化）分散在多个 effect/callback，扩展成本高。
3. `toMarkdown` 同时输出 `width` 与 `style`，可用但存在语义冗余。
4. 历史 HTML 图片节点迁移存在潜在 `pos mapping` 风险（多节点替换时位置漂移）。
5. `onChange` 触发源不唯一（listener + 手动 emit），容易重复触发保存链路。

本文档给出短期修复（P1/P2）与中期架构演进方案。

---

## 2. 目标与非目标

### 2.1 目标

- 修复迁移替换中的高优先级位置映射风险（P1）。
- 统一单一 `onChange` 源，降低重复触发与状态竞争（P2）。
- 明确图片序列化规范，降低未来扩展冲突。
- 为后续 caption/crop/link 等能力预留清晰边界。

### 2.2 非目标

- 本阶段不重写整套编辑器。
- 不调整现有用户可见交互（拖拽体验、工具栏 UI）。
- 不引入新的跨进程协议（`apps/client` / `packages/core` 不变）。

---

## 3. 当前问题拆解

### 3.1 文件职责耦合

`MilkdownEditorInner.tsx` 同时承担：

- 编辑器初始化与 schema 注册
- 图片选择/定位/toolbar/resize
- 表格右键菜单
- 高亮与滚动定位
- 粘贴上传与错误弹窗

导致：

- 代码阅读成本高
- effect 之间隐性耦合，改一处影响多处
- 单元测试与回归测试难拆分

### 3.2 迁移替换的 pos 风险（P1）

在同一事务中遍历原始文档并连续 `replaceWith(pos, ...)`，若存在多个可替换节点，后续位置可能受前序替换影响（即使当前场景很多节点 nodeSize 恰好一致，也不应依赖偶然性质）。

### 3.3 onChange 双源竞争（P2）

当前 resize 结束后手动 `onChange(newMarkdown)`，同时 listener `markdownUpdated` 也会触发，造成重复链路：

- 重复 `updateContent`
- 重复 dirty/saving 判断
- 额外日志噪音

### 3.4 序列化字段冗余

当前 HTML 输出中同时写：

- `width="..."`
- `style="width:...px"`

可兼容，但长期可能出现“冲突优先级不一致”的问题（解析时优先读哪个、不同渲染器行为是否一致）。

---

## 4. 方案总览

按两阶段实施：

- **Phase A（本轮）**：稳定性优先，完成 P1 + P2。
- **Phase B（后续）**：分层重构，拆分文件职责并统一序列化规范。

---

## 5. Phase A：稳定性修复（P1 + P2）

### 5.1 P1：修复迁移替换的 pos mapping

#### 5.1.1 设计原则

- 不在遍历过程中直接写入事务。
- 先收集，后替换。
- 替换时按“位置倒序”执行，避免前序替换影响后序位置。

#### 5.1.2 实施步骤

1. 扫描 `doc.descendants`，收集候选项：
   - `from`
   - `to`
   - `nextNode`（imageNodeType.create(parsedAttrs)）
2. 将候选项按 `from` 降序排序。
3. 依次 `tr.replaceWith(from, to, nextNode)`。
4. 最后统一 `dispatch(tr)`（仅当 `tr.docChanged`）。

#### 5.1.3 验收标准

- 一个文档中包含 3+ 个 HTML 图片节点时，全部正确转换，无错位。
- 转换后可正常选中/对齐/resize。

---

### 5.2 P2：统一单一 onChange 源

#### 5.2.1 设计决策

**保留 listener 作为唯一 onChange 源**，移除 resize 中手动 emit。

原因：

- listener 属于编辑器标准数据出口，语义更统一。
- 避免双写导致的重复调用和时序竞争。
- 后续做变更来源标记（typing/paste/resize/migrate）更自然。

#### 5.2.2 具体改动

1. 删除 `handleResizeEnd` 中 `onChangeRef.current(newMarkdown)` 手动调用。
2. 所有文档变更统一通过事务 `dispatch`，由 listener 发出 markdown。
3. 保留 `EditorService.updateContent` 的“相同内容短路”作为兜底。

#### 5.2.3 风险与兜底

- 若极端情况下 listener 不触发（理论上不应发生），可在 dev 下加断言日志，而不是恢复双源。

#### 5.2.4 验收标准

- resize 一次仅触发一条主持久化链路。
- `updateContent skipped: same content` 显著减少。

---

## 6. Phase B：结构重构（解耦与扩展性）

### 6.1 文件拆分建议

将 `MilkdownEditorInner.tsx` 的图片能力拆到独立模块：

- `editor/image/image-session.ts`
  - 选中态、overlay 坐标、节点位置
- `editor/image/image-commands.ts`
  - 对齐、删除、resize 持久化事务
- `editor/image/image-migration.ts`
  - html 节点迁移（运行期）
- `editor/image/use-image-interaction.ts`
  - pointer/selection 事件绑定

`MilkdownEditorInner` 仅做编排：

- 初始化 editor
- 挂载 feature hooks（image/table/highlight/slash）
- 渲染容器与浮层

### 6.2 custom-image 扩展分层

当前 `custom-image.ts` 建议拆分为：

- `image-schema.ts`：schema + parse/toDOM + toMarkdown
- `image-html-parser.ts`：HTML `<img>` 解析与归一化
- `image-legacy-migration.ts`：`aimo-image-state` 注释迁移

收益：

- 迁移逻辑与运行态 schema 解耦
- 可单测覆盖解析器与序列化器

### 6.3 序列化规范统一（width/style）

建议定义单一“规范字段”策略（推荐其一）：

- **策略 A（推荐）**：以 `width` 属性为规范字段，`style` 仅用于渲染层临时态，不入库。
- 策略 B：以 `style` 为规范字段，解析时只认 `style.width`。

推荐 A 原因：

- 结构化字段更易解析、比对与测试
- 避免 style 串解析歧义

兼容策略：

- 解析阶段兼容读取两者
- 序列化阶段仅写规范字段

---

## 7. 测试与回归清单

### 7.1 功能回归

1. 新插入图片：可选中、对齐、删除、resize。
2. resize 后切笔记再切回：宽度持久化正确。
3. 历史文档中 `<img ...>`：首次打开后渲染为真实图片。
4. 多图片文档：迁移无错位。

### 7.2 序列化回归

1. `![alt](url)`（无对齐无尺寸）保持 markdown image 语法。
2. 有对齐或尺寸时输出 HTML 图片语法。
3. 规范字段唯一输出（按最终策略验证）。

### 7.3 性能/噪音回归

1. resize 拖动过程中无额外持久化风暴。
2. `updateContent skipped` 日志次数明显下降。

---

## 8. 里程碑与实施顺序

1. **M1（当天）**：P1 位置映射修复 + P2 单一 onChange 源。
2. **M2（1~2 天）**：`custom-image` 拆分 + 基础单测。
3. **M3（后续迭代）**：`MilkdownEditorInner` 图片模块化（hook + commands + session）。
4. **M4（后续迭代）**：序列化规范收敛（width/style 单源）。

---

## 9. 预期收益

- 稳定性：消除多节点迁移错位风险。
- 可维护性：减少双源更新与时序问题。
- 可扩展性：为 caption/crop/link/lazy-load 等能力提供清晰扩展点。
- 可测试性：解析、迁移、序列化可分别验证。
