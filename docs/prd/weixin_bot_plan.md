# 微信 iLink Bot 接入实施方案 (Implementation Plan)

## 1. 核心目标 (Objective)
将 `note_all` 后端与微信 iLink Bot 协议对接，实现“微信即笔记入口”的能力。用户在微信聊天框发送的任何内容（文字、图片、文件）将自动进入系统的碎片收件箱，并支持通过微信向个人知识库提问。

## 2. 核心架构设计 (Architecture)

### 2.1 模块分工
- **`pkg/weixin`**: 微信协议底层封装（请求头生成、签名算法、CDN 解密、通用 API 客户端）。
- **`service/weixin_bot.go`**: 业务 logic 层。负责长轮询调度、消息路由分发、`context_token` 维护、RAG 意图识别。
- **`models/weixin.go`**: 定义微信凭证、消息结构、会话上下文存储。
- **`router/weixin.go`**: 提供给前端/管理端的 API（扫码、状态查询、Bot 控制）。

### 2.2 数据流向
1. **上行**：`WeChat -> iLink API -> getupdates (Poll) -> weixin_bot.go -> note.go (CreateNote)`.
2. **下行**：`weixin_bot.go -> RAGAsk -> weixin_bot.go -> sendmessage -> WeChat`.

---

## 3. 任务清单 (Task List)

### Phase 1: 认证与配置持久化
- [ ] **DB 模型定义**：在 `models/` 创建 `weixin.go`，定义 `WeixinBotCredential`（存储 token, accountId, baseUrl, updatesBuf）。
- [ ] **基础请求封装**：在 `pkg/weixin` 实现 `X-WECHAT-UIN` 生成算法和带 Auth 的请求客户端。
- [ ] **扫码登录 API**：
    - [ ] `GET /api/weixin/qrcode`: 获取二维码及轮询令牌。
    - [ ] `GET /api/weixin/status`: 轮询扫码状态，成功后将凭证写入 DB 或 `config.json`。

### Phase 2: 长轮询与消息路由
- [ ] **初始化调度**：在 `main.go` 启动时，若库中存在有效凭证，启动异步 Goroutine `service.StartWeixinBotPolling()`.
- [ ] **长轮询逻辑**：实现 `getupdates` 逻辑，处理 35s 超时、游标持久化及 `-14` 异常重登逻辑。
- [ ] **消息处理器 (Dispatcher)**：
    - [ ] 提取 `context_token` 并缓存。
    - [ ] 提取用户信息 `from_user_id`。
    - [ ] 根据 `item_list` 中的 `type` 分发到不同的处理函数。

### Phase 3: 业务功能集成 (深度对接)
- [ ] **文本笔记录入**：
    - 调用 `service.CreateNoteFromText`。
    - 异步反馈：发送“笔记已存入碎片库，AI 正在分析中...”。
- [ ] **媒体文件处理 (难题)**：
    - 实现 CDN 资源下载（处理 `CDNMedia` 结构）。
    - *预研*：是否需要在内存解密再落盘。暂定先下载原始加密包或调用微信提供的下载链路。
    - 调用 `service.UploadAndCreateNote`。
- [ ] **RAG 智能问答**：
    - 识别用户是否在提问（例如：以问号结尾，或包含“找”、“搜”等词汇）。
    - 调用 `service.RAGAsk(query)` 获取答案。
    - 调用 `sendmessage` 回复用户，支持 Markdown 转换为文本。

### Phase 4: 健壮性与优化
- [ ] **Typing提醒**：在 RAG 处理耗时较长时，调用 `sendtyping` API。
- [ ] **流式模拟**：分片发送长文本（2000 字符限制）。
- [ ] **多账号隔离**：虽然初期只支持单 bot，但架构设计上应基于 `ilink_bot_id` 隔离状态。

---

## 4. 技术方案细节 (Thought)

### 4.1 会话上下文 (Context Management)
由于 `sendmessage` 强依赖 `context_token`，系统需要建立一个 `UserContextCache` (内存 + 定期持久化)，Key 为 `(bot_id, user_id)`，Value 为最近一次收到的 `context_token`。

### 4.2 意图识别的模糊处理
在微信场景下，用户可能只是随手发一句话，也可能是在搜索。
- **策略 A**：所有文本默认保存为笔记，并在保存后询问“是否需要基于此进行搜索？”。
- **策略 B**：调用现有的 `IntentDetection`。如果置信度高（Score > 1）则认为是搜索，否则视作笔记录入。**优先推荐策略 B** 以保证知识库的纯净感。

### 4.3 安全性建议
- 微信凭证不建议放在 `config.json`（避免源码泄漏风险），应存储在 SQLite 数据库中。
- `X-WECHAT-UIN` 必须每次动态生成，不可硬编码。

---

## 5. 验收标准
1. 发送文字到 Bot -> 网页版后台出现对应的“文字录入”笔记。
2. 发送图片到 Bot -> 网页版后台出现对应图片，且 OCR 成功显示。
3. 问 Bot “我之前记过关于...的内容吗？” -> Bot 回复相关摘要。
