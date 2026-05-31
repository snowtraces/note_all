# 规范：知识实验室 WIKI 化改造

## 1. Objective (客观目标)
知识实验室（Lab）当前可以将多个碎片合成一篇长文。本规范旨在引入“WIKI化”的概念，增强知识积累的连续性和可追溯性：
1. **自动打标**：所有从实验室初始生成的长文笔记，默认自动打上 `WIKI` 的标签，以便分类和检索。
2. **碎片追加 (Append)**：允许用户在实验室中，将新的碎片内容追加（融合）到已有的某一个 WIKI 中，而不是每次都生成全新的长文。
3. **溯源穿透视图**：当用户查看某篇 WIKI 笔记时，无论原始作为素材的碎片是否被归档（`is_archived`），都能在一个独立的区域直观查看到这篇 WIKI 融合的所有源碎片。

## 2. Tech Stack (技术栈)
- **Frontend Core**: React 18, Vite.
- **Backend Core**: Gin (Go), GORM, SQLite.

## 3. Commands (常用命令)
- 启动前端开发服务：`npm run dev` (在 `frontend` 目录下)
- 前端打包构建：`npm run build` (在 `frontend` 目录下)
- 后端编译运行：`go build -tags "fts5" && .\note_all_backend.exe` (在 `backend` 目录下)

## 4. Feature Design & Data Flow (功能设计与数据流转)

### 4.1 自动打标 (Tagging)
- **后端改造**：在 `CreateSynthesizedNote` 逻辑中，初始落库的 `note_items` 记录不再等待后台异步提取才产生标签。我们在创建时，直接为其追加一条 `WIKI` 的内部系统标签（写入 `ai_tags` 并在 `note_tags` 表中生成记录）。

### 4.2 碎片追加流程 (Append Flow)
- **前端 UI (LabView.jsx)**：
  - 增加一个选项：`[生成新 WIKI]` vs `[追加到已有 WIKI]`。
  - 选择追加模式时，提供一个下拉选择框或抽屉，列出当前系统内带有 `WIKI` 标签的文章供用户选择（调用一个专门检索 WIKI 的接口）。
- **后端接口改造**：
  - **列出候选 WIKI API**：`GET /api/wiki/list`，拉取含有 `WIKI` 标签的文章。
  - **追加预览 API**：`POST /api/note/synthesize/append`。接收 `wiki_id` 和 `ids`（新碎片IDs）。后端提取原 WIKI 内容以及新碎片内容，交给大模型（Prompt 需要引导其融合两者内容），返回融合后的预览结果。
  - **追加落盘 API**：`POST /api/note/synthesize/append/save`。接收 `wiki_id`，`ids`，以及用户确认的 `content`。后端更新该 WIKI 的正文，并将新的 `ids` 加入到其 `Parents` 血缘关系中（即往 `note_relations` 中插入新的关联记录）。

### 4.3 WIKI 碎片溯源视图 (View)
- **后端调整**：目前 `GET /api/note/:id` 已经通过 `Preload("Parents")` 返回了关联的素材碎片。由于 GORM 机制，即使碎片设置了 `is_archived = true`，只要未被逻辑删除（`deleted_at IS NULL`），依然会被完整关联查出。因此后端可能无需新增专门接口，只需验证是否下发了相关字段。
- **前端调整 (NoteView 或 Sidebar)**：在查看详情时，如果当前笔记带有 `WIKI` 标签，且存在 `parents` 数据，则在侧边或底部增加一个 **“溯源档案 (Sources)”** 的 UI 面板。列出融合进该 WIKI 的所有源碎片，并可以直接预览。

## 5. Boundaries (边界约束)
- **Always do**:
  - 追加融合时，大模型 Prompt 必须明确要求“保留原有 WIKI 的核心结构，合理融合新知识”，避免大模型将原有的长文大幅缩减。
  - 维持 `note_relations` 的一致性。
- **Ask first**:
  - 如果前端需要对 WIKI 视图做单独的弹窗重构，而非嵌入现有的详情页，需要再做 UI 设计。
- **Never do**:
  - 绝不硬删除原有的素材碎片。
  - 绝不修改源碎片的原文，只维护从 WIKI 到源碎片的只读关系。

## 6. Success Criteria (验收标准)
1. 在实验室选择碎片后合成并保存，新生成的笔记必定带有 `WIKI` 标签。
2. 实验室 UI 支持选择“追加到已有 WIKI”，并能正确拉取到所有历史生成的 WIKI。
3. 执行追加合成后，现有 WIKI 文章的正文被更新，且新碎片的 ID 成功被绑定为它的 `Parents`。
4. 打开该 WIKI 的详情，可以清晰看到一个源文件列表，包含了初始生成时使用的碎片，以及后来追加进来的碎片。哪怕这些碎片处于“归档”状态，依然能在该列表正常阅览。

## 7. Open Questions (待确认问题)
1. **追加后是否触发重新提炼摘要？** 由于追加后原 WIKI 的全文发生变化，是否依然让后台的 `WorkerChan` 重新根据新的长文提炼 `ai_summary` 并更新向量块？(建议：需要更新向量和摘要，但必须确保 `WIKI` 标签不被大模型洗掉)。
2. **源碎片的预览交互**：在详情页查看这些源碎片时，是以抽屉形式展开，还是新开一个浮层预览？(建议：采用折叠列表，点击后在行内或弹出的简单气泡中预览即可，保持轻量)。
