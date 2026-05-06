# 实施计划: Phase C1 - MCP 协议支持（含智能推送与回顾）

## 概述

本计划定义了为 Note All 后端系统增加 Anthropic Model Context Protocol (MCP) 本地协议支持的逐步开发与验证方案。
我们不仅要支持外部 AI（如 Claude Desktop）对本地知识库进行高精度的**混合语义检索与文档读取**，还要支持**“最近活跃笔记”的智能回顾（带有自动时间退避降级与关键信息预览）**，以及让外部 AI 能够直接将聊天中的**富文本和图片碎片一键推送并保存入库**。

---

## 架构决策 (Architecture Decisions)

1. **Stdio 本地通信**：采用标准 Stdio（stdin/stdout）通信，通过本地可执行程序 `--mcp` 标志拉起，零配置、极速直连、无网络鉴权开销。
2. **绝对标准流隔离**：主程序一旦进入 MCP Stdio 模式，将全局重定向 `log.SetOutput(os.Stderr)` 并将 GORM 的日志流重定向至 Stderr 或静音。任何时候严禁有任何非法控制台打印（如 FTS SQL 打印或普通 panic 追踪）流向 `os.Stdout`，确保 JSON-RPC 信道不被污染。
3. **服务进程解耦**：当检测到 `--mcp` 参数时，后端**仅初始化 SQLite DB 核心与分析线程**，不启动 Gin HTTP 网络服务、外部定时任务或静态资源服务器，极大降低内存损耗并消除本地 3344 端口占用冲突。
4. **双策略图片推送**：针对图片推送功能：
   - **绝对路径极速读（优先）**：如果外部 AI 本地运行，可直接感知图片绝对路径，服务端直接 `os.Open` 读取（避免 Stdio 信道传输数 MB 大文件导致的 JSON-RPC 卡顿和消息分片解析报错）。
   - **Base64 内存读（兜底）**：针对 AI 临时生成的图像，接收 Base64 数据解码后通过内存 Reader 入库。

---

## 依赖关系拓扑图 (Dependency Graph)

```
[go.mod 引入 mcp-go SDK]
         │
[main.go 命令行 --mcp 标志与标准流重定向]
         │
[service/note.go 扩充 CreateNoteFromReader 通用入库接口]
         │
[mcp/server.go 初始化 MCP 基础服务与 Resources 注册]
         │
[mcp/tools.go 核心工具集：检索、读取、智能最近回顾、文本推送、图片推送]
         │
[单元测试 & MCP Inspector 网页集成调试]
         │
[Claude Desktop 终端用户真实客户端联调]
```

---

## 任务列表 (Task List)

### Phase 1: 基础建设 (Foundation)

#### Task 1: 引入 mark3labs/mcp-go 依赖与 CLI 启动标志拦截
- **描述**：在后端引入高性能的 Go 官方 MCP SDK，并在 `main.go` 中解析 `--mcp` 命令行标志，实施标准流重定向。
- **验收条件**：
  - [ ] 成功执行 `go get github.com/mark3labs/mcp-go`，`go.mod` 依赖项被正常锁住。
  - [ ] 修改 `backend/main.go`：检测到 `--mcp` 时，调用 `log.SetOutput(os.Stderr)` 将全局默认日志流重新路由至标准错误。
  - [ ] 禁用 GORM 的 stdout SQL 日志输出，设为仅打印 Error 级别至 Stderr。
  - [ ] 避开 Gin Engine 启动流、静态资源加载与自动同步定时器，使进程专注处于等待 stdin 通信状态。
- **验证步骤**：
  - [ ] 在 `backend` 目录下执行编译：`go build -tags "fts5" -o note_all_backend.exe`。
  - [ ] 执行 `.\note_all_backend.exe --mcp`，进程保持运行挂起状态，且命令行**不向 stdout 吐出任何调试字符**。
- **涉及文件**：
  - [backend/main.go](file:///c:/Users/cheng/code/note_all/backend/main.go)
  - `backend/go.mod`
- **预计工作量**：S

#### Task 2: 扩充 service.CreateNoteFromReader 核心数据持久化接口
- **描述**：由于现有的 `UploadAndCreateNote` 只接收 HTTP Multipart 上传，我们需要重构或增加一个基于 `io.Reader` 的通用入库接口，以供 MCP 图片推送工具调用，实现数据解耦。
- **验收条件**：
  - [ ] 在 `backend/service/note.go` 中设计并暴露通用接口 `CreateNoteFromReader(filename string, fileType string, size int64, r io.Reader) (*models.NoteItem, error)`
  - [ ] 自动调用 `global.Storage.Save` 进行落盘，向 `NoteItem` 与 `FileMetadata` 存入数据并写入 SQLite DB。
  - [ ] 成功将分析任务抛入 `global.WorkerChan`，启动后台异步多模态 OCR 与 VLM 提炼线程。
- **验证步骤**：
  - [ ] 在 `service/note_test.go` 中编写简易测试函数，传入内存中的 `bytes.NewReader(imgBytes)`，验证数据库是否正常新增 pending 状态记录，且后台异步分析程序能正常触发。
- **涉及文件**：
  - [backend/service/note.go](file:///c:/Users/cheng/code/note_all/backend/service/note.go)
  - `backend/service/note_test.go`
- **预计工作量**：S

---

### Checkpoint 1: 基石闭环
- [ ] 后端编译成功：`go build -tags "fts5"`。
- [ ] 以 `--mcp` 启动时，stdout 处于完美静默隔离状态。
- [ ] 底层 `io.Reader` 级的文件推送服务通过单元测试，且能够唤醒异步 AI 分析管道。

---

### Phase 2: MCP 核心协议与工具集实现 (Core Features)

#### Task 3: 初始化 MCP Server 核心并绑定静态资源视图 (Resources)
- **描述**：新建 `backend/mcp` 目录包，初始化 Stdio 模式服务端，并暴露系统笔记资源视图（Resources）。
- **验收条件**：
  - [ ] 新增 `backend/mcp/server.go`：配置服务端基本信息并启动服务闭环。
  - [ ] 新增 `backend/mcp/resources.go`：注册并绑定以下两个静态/动态资源，让外部 AI 能够主动了解知识库底稿：
    - `note-all://notes`：拉取整库可用文档元数据列表。
    - `note-all://notes/{id}`：拉取单个文档正文内容。
- **验证步骤**：
  - [ ] 确保 `StartServer()` 与主程序 `--mcp` 标志入口链接正常，能正常调用 `mcpServer.Start()`。
- **涉及文件**：
  - `backend/mcp/server.go` (新建)
  - `backend/mcp/resources.go` (新建)
- **预计工作量**：S

#### Task 4: 实现高精混合语义检索与正文读取工具 (`search_notes`, `read_note_by_id`)
- **描述**：在 `backend/mcp/tools.go` 中实现检索和读取核心工具，将后端既有的混合检索引擎暴露给外部 AI。
- **验收条件**：
  - [ ] 注册 `search_notes` 工具：支持参数 `query`（必选）和 `limit`（可选）。底层直接调用 `service.HybridSearch` 进行语义 + 全文检索 + tags 混合打分排序，并以 Markdown 排版优雅返回给 AI。
  - [ ] 注册 `read_note_by_id` 工具：支持参数 `id`（必选）。返回指定 ID 笔记的详细元数据与完整 OCR markdown 正文。
  - [ ] 边界控制：所有读取和检索工具只查 `deleted_at IS NULL` 且状态为 `analyzed` 或 `done` 的低噪声高质量有效笔记。
- **验证步骤**：
  - [ ] 编写测试用例调用 `handleSearchNotes` 和 `handleReadNote`，确认能正确解析传入参数，且无 SQL 日志流向 stdout。
- **涉及文件**：
  - `backend/mcp/tools.go` (新建)
- **预计工作量**：M

#### Task 5: 实现【最近】回顾工具与文本、图片双向推送工具
- **描述**：在 `backend/mcp/tools.go` 中实现极具痛点的大脑交互机制，支持最近回顾与即时推送。
- **验收条件**：
  - [ ] 注册 `get_recent_notes` 工具：
    - 支持天数参数 `days` (默认3) 与数量参数 `limit` (默认10)。
    - **退避降级**：若 $N$ 天内活跃笔记少于3条，自动退避扩展天数范围（3天 -> 30天 -> 不限时间获取最新数据），绝不返回空。
    - **预览层**：列表项中强制包含摘要、标签、更新时间元数据。
  - [ ] 注册 `push_text_note` 工具：支持正文 `content` 与可选标题 `title`。直接复用 `service.CreateNoteFromText` 实现一键入库并排队大模型提炼。
  - [ ] 注册 `push_image_note` 工具：支持文件名 `filename`，本地绝对路径 `path` (策略一，优先直读) 与 `base64_data` (策略二，内存解码直读)。调用 `service.CreateNoteFromReader` 极速入库并激活 OCR / VLM。
- **验证步骤**：
  - [ ] 模拟 Base64 图片上传，验证在 Go 的 Stdio 环境下内存解码功能正常，无数据截断。
  - [ ] 模拟空时间窗口测试，确保自动触发 30 天/不限天数的时间衰减退避逻辑。
- **涉及文件**：
  - `backend/mcp/tools.go` (追加修改)
- **预计工作量**：M

---

### Checkpoint 2: 工具链功能全闭环
- [ ] 编译无警告，`mcp/` 核心工具包开发完毕。
- [ ] 单元测试全面通过，逻辑完备。
- [ ] `push_image_note` 的两种提取通道（本地直读/Base64）均无异常。

---

### Phase 3: 多端集成、联调与交付 (Integration & Polish)

#### Task 6: MCP Inspector 可视化网页联调与本地集成验证
- **描述**：使用官方权威协议测试套件 MCP Inspector，对已构建的服务端进行可视化沙盒测试，确保数据无损和异常处理逻辑完美。
- **验收条件**：
  - [ ] 在本地运行 `npx @modelcontextprotocol/inspector note_all_backend.exe --mcp`，能顺利开启本地网页调试台。
  - [ ] 在调试台 `Tools` 标签下可以看到 5 个注册的工具，其 JSON-Schema 声明格式完美（无未命名或非法嵌套对象）。
  - [ ] 依次运行：
    - 运行 `search_notes`：输入中文 Query，检查是否能吐出相关的笔记 markdown快照，且评分正常。
    - 运行 `get_recent_notes`：检查在有无数据时退避行为是否完全符合架构设定。
    - 运行 `push_text_note` 和 `push_image_note`：通过网页直接写入内容和上传图片，验证终端提示与后端排队正常。
  - [ ] 检查控制台（Stdout），除了握手报文，**百分之百没有任何普通日志文本夹杂**。
- **涉及文件**：无（运行集成测试）
- **预计工作量**：S

#### Task 7: 部署至 Claude Desktop 真实客户端并验证真实场景闭环
- **描述**：配置本地 Claude 配置文件，将 Note All 激活为其外挂数据库，进行多维度的开发场景实机联调。
- **验收条件**：
  - [ ] 修改 `claude_desktop_config.json`（通常位于 `%APPDATA%\Claude\claude_desktop_config.json`），添加 `note-all` MCP 服务端配置。
  - [ ] 重新拉起 Claude Desktop，无连接报错红字，在聊天对话框右下角显示插头图标，并正确列出 `note-all` 注册的工具有效项。
  - [ ] 实测以下会话，确保 AI 能自主串联调用工具：
    - **提问一**：“帮我搜索下我的 note-all 知识库，看看里面有没有关于离线模式相关的设计草稿？” -> AI 自动调用 `search_notes`，然后根据返回的列表 ID 调用 `read_note_by_id` 提炼。
    - **提问二**：“拉一下我最近更新的内容，看看我最近在干什么？” -> AI 自动调用 `get_recent_notes` 给出合理的学习或复习规划建议。
    - **提问三**：“我想把我们刚刚写好的这篇 Python 代码和逻辑，推送存入我的 note-all，作为新知识保存。” -> AI 自动调用 `push_text_note` 将代码格式化直接推入数据库，并给出 Pending 状态提醒。
- **涉及文件**：
  - `C:\Users\cheng\AppData\Roaming\Claude\claude_desktop_config.json`
- **预计工作量**：M

---

### Checkpoint 3: 整体完备验收
- [ ] MCP Inspector 运行完美，无协议中断。
- [ ] Claude Desktop 真实端到端场景表现惊艳，双向读取、最近回顾与碎片推送逻辑运转如飞。
- [ ] 提交代码并运行 /commit 工作流清理战场。

---

## 风险与规避策略 (Risks and Mitigations)

| 风险点 | 风险等级 | 规避与应对方案 |
|------|--------|------------|
| **第三方库或底层 SQL 日志污染 Stdout 流导致客户端断开** | **High** | 1. 强制在 `main.go` 命令行检测最前端执行 `log.SetOutput(os.Stderr)`。<br>2. 更改 GORM 日志输出模式为静音或将其设置给 Stderr Logger，确保主进程只将 JSON-RPC 的 IO 传递给 Stdout。 |
| **Stdio 模式下巨型 Base64 图片在标准输入流中堵塞管道** | **Medium** | 1. 强力推荐外部 AI 尽量优先采用 **策略一（直接绝对路径直读）**。<br>2. 在 `push_image_note` 的 Base64 解码段增加适当的长度上限防护，若文件超过 15MB 自动返回带有友好提示的友好报错。 |
| **外部 AI 在 pending 阶段去调用 read_note_by_id 获得空数据** | **Low** | 在读取接口中做出清晰拦截：若该笔记还未处于 `analyzed` 或 `done` 状态，返回一个带有说明的明确说明（例如：“该笔记正在队列中分析，AI 将在数秒内提取完毕，请稍后再试”），防止 AI 认为系统出错。 |

---

## 唯一开放性问题 (Open Questions)

- **归档文档的可见性 (Archived Notes)**：已归档的笔记（`is_archived = true`）是否应当允许外部 AI 检索？
  - *方案设计*：默认不检索。为了给用户提供更高灵活性，我们在 `search_notes` 和 `get_recent_notes` 中各预留一个可选参数 `include_archived bool`（默认 `false`），让外部 AI 在检索时可以主动提出检索归档文档的诉求。
