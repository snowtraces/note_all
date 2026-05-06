# Spec: Phase C1 - MCP 协议支持（读取文档功能）

> [!NOTE]
> 本规范定义了 Note All 的 Model Context Protocol (MCP) 服务端设计，使外部 AI 客户端（如 Claude Desktop）能够安全、高效地读取、搜索和分析用户本地的个人知识库。

---

## 1. 核心目标 (Objective)

为 Note All 实现标准的 **Model Context Protocol (MCP)** 服务，使外部 AI（如 Claude Desktop）既能**智能读取和检索**用户本地的个人知识库，又能将零碎思考或图片**实时推送并收集入库**，实现双向、全自动的知识管理闭环。

### 用户故事 (User Stories)
- **场景 A**：用户在 Claude Desktop 中进行技术开发或日常对话时，AI 可以通过调用工具在 Note All 知识库中执行混合检索（向量相似度 + 全文检索），找出与当前任务相关的背景文档。
- **场景 B**：外部 AI 通过 ID 读取单篇笔记的完整 OcrText（Markdown）正文，并对其进行深度提炼、代码生成或多文档交叉分析。
- **场景 C（最近/最新回顾）**：外部 AI 能主动拉取用户**【最近】**更新的碎片列表，帮用户规划今日复习计划或思维碰撞。
- **场景 D（碎片即时推送）**：用户在与外部 AI 聊天中产生的新点子、生成的新代码、或上传给外部 AI 的网页截图，外部 AI 能帮用户**直接推送、上传入库**到 Note All，自动在后台排队进行 OCR/VLM 及 LLM 提炼。

### 场景 C：【最近】概念设计 (The "Recent" Concept Design)
为了使 AI 能够充分聚焦用户当下的关注焦点，并有效进行“今日复习计划”或“即兴思维碰撞”，我们引入以下设计：
1. **时间过滤器 (Time Window Filter)**：
   - 默认指定检索天数（如 `days = 3` 或 `days = 7`），专门查询此窗口内被创建或修改的笔记碎片。
2. **智能时间退避降级 (Intelligent Decay Rollback)**：
   - 如果设定的时间窗口内（如 3 天内）新增或更新的笔记过少（少于 3 条），系统将**自动退避降级**：依次自动扩大范围至最近 7 天、30 天，或者不限天数直接拉取最新的 $N$ 条笔记，确保 AI 在任何时候都有足够且相关的复习素材，不至于返回空列表。
3. **关键元数据预览层 (Metadata Preview Layer)**：
   - AI 主动拉取的“最近列表”中，每个条目除了 ID 和原文件名外，将**直接内置 `ai_summary`（AI摘要）、`ai_tags`（AI标签）和 `updated_at`（更新时间）**。外部 AI 在免于逐篇读取每篇文档正文的前提下，即可通过列表层元数据快速做出关系分析 and 复习规划，提升分析效率。

### 核心功能范围 (Core Scope)
1. **HTTP SSE 传输协议**：基于标准的 Server-Sent Events (SSE) 进行 HTTP 双向通信，提供 Token 安全隔离校验，可轻松被远程或本地客户端（如 Claude Desktop / Cursor / Windsurf）挂载。
2. **知识检索工具 (`search_notes`)**：将系统现存的混合检索引擎（SQLite FTS5 + 向量嵌入 + 标签 + 活跃度评分）暴露为 MCP Tool，支持高精度的语义和全文检索。
3. **单笔记读取工具 (`read_note_by_id`)**：通过 ID 读取单条笔记的详细元数据与 OCR 完整正文。
4. **近期笔记列表工具 (`get_recent_notes`)**：基于**【最近】**概念设计（支持天数过滤器与自动时间退避降级），拉取近期更新的笔记列表，内置元数据预览。
5. **按标签筛选工具 (`get_notes_by_tag`)**：获取含有特定标签的笔记集合。
6. **推送文本笔记工具 (`push_text_note`)**：允许外部 AI 将对话中生成的 Markdown、代码或思考作为文本一键推送落库，自动触发后台异步摘要与标签提炼服务。
7. **推送图片文件工具 (`push_image_note`)**：支持外部 AI 推送图片。策略一：直接传入本地图片绝对路径由服务端直接读取（适合本地调试，免除大文件 base64 通信开销）；策略二：传入 Base64 格式，解码后存入 `snow_storage`，并自动触发 OCR、VLM 视觉分析全链路。
8. **动态资源端点 (MCP Resources)**：
   - `note-all://notes`：作为静态资源吐出所有可用笔记的摘要元数据列表。
   - `note-all://notes/{id}`：动态绑定单个笔记的全文内容。

---

## 2. 假设与前置条件 (Assumptions)

1. **协议选择**：优先实现基于 HTTP SSE 传输通道。由于 SSE 基于纯 HTTP 标准协议，可极为简单地穿透内网、配合各种网络客户端使用，并具有天然的多用户和 token 安全验证拓展性。
2. **Token 安全验证**：鉴于 SSE 会公开在本地甚至公网上，必须对任何访问链接校验 `token` 参数（如 `?token=xxx`）或 Bearer 请求头。
3. **第三方 SDK**：选用活跃度高、接口简单优雅的 `github.com/mark3labs/mcp-go` 作为核心 SDK。
4. **服务整合模式**：MCP 模式作为后端主程序的一个**命令行启动参数/子命令**。例如运行 `.\note_all_backend.exe --mcp` 时，程序只初始化数据库和核心检索服务，直接在 `:3344` 端口拉起带 Token 拦截器的 MCP HTTP SSE 服务，而不再启动 Gin HTTP 服务器，完美避免本地端口冲突，且减少内存开销。

---

## 3. 技术栈 (Tech Stack)

- **语言**：Go 1.25+
- **数据库 ORM**：GORM + SQLite3
- **检索依赖**：内置 SQLite FTS5 (Trigram 索引) + 本地向量检索（通过 Python `embedding_server.py` 服务获取 embedding 向量）
- **MCP SDK**：`github.com/mark3labs/mcp-go` (v0.52.0+)

---

## 4. 运行与构建命令 (Commands)

```bash
# 1. 引入 Go MCP 依赖（需首先在 backend 目录下执行）
go get github.com/mark3labs/mcp-go
go mod tidy

# 2. 正常以 HTTP 网页服务模式启动后端
cd backend && go run main.go

# 3. 以 MCP SSE 独立服务端模式启动后端
cd backend && go run main.go --mcp

# 4. 编译后端可执行程序
cd backend && go build -tags "fts5" -o note_all_backend.exe
```

---

## 5. 项目结构调整 (Project Structure)

为保持系统高内聚、低耦合，我们将在 `backend/` 下新增一个专门处理 MCP 协议的包 `mcp/`：

```
backend/
├── mcp/
│   ├── server.go        # MCP 服务端 HTTP SSE 初始化、Token 拦截与端口监听
│   ├── tools.go         # 注册的 MCP Tools 处理器实现 (search, read, list, tag)
│   └── resources.go     # 注册的 MCP Resources 处理器实现 (note-all://notes)
├── database/
│   └── db.go            # 现有数据库初始化
├── service/
│   ├── note.go          # 现有笔记服务（供 MCP 复用）
│   └── rag.go           # 现有混合检索服务（供 MCP 复用）
├── global/
│   └── global.go        # 全局配置与全局 DB
└── main.go              # 入口（解析 --mcp 命令行参数）
```

---

## 6. 代码设计风格与示例 (Code Style)

### A. 全局流向控制与初始化 (在 `main.go` 中)

```go
package main

import (
	"flag"
	"log"
	"os"

	"note_all_backend/database"
	"note_all_backend/global"
	"note_all_backend/mcp"
	"note_all_backend/service"
)

func main() {
	// 解析命令行参数
	mcpMode := flag.Bool("mcp", false, "以 MCP 协议(SSE/HTTP)模式启动服务")
	flag.Parse()

	// 1. 加载配置（略）...
	
	if *mcpMode {
		// 2. 仅初始化底层核心组件，不启动 Gin Web、定时器等
		database.InitSystem()
		service.InitWorker()
		
		// 禁用 GORM 的 SQL 控制台冗余输出
		global.DB.Logger = global.DB.Logger.LogMode(logger.Silent)
		
		log.Println("Note-All 正在以 MCP 服务端模式启动（SSE 传输协议）...")
		
		// 3. 启动 MCP SSE 协议处理服务，监听端口并校验 Token
		mcp.StartServer()
		return
	}

	// 否则走原有的 Gin HTTP 启动流程...
}
```

### B. MCP Tools 声明与注册示例 (在 `mcp/tools.go` 中)

```go
package mcp

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/service"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

// RegisterTools 注册所有文档读取与写入相关的工具
func RegisterTools(s *server.MCPServer) {
	// 1. 混合检索工具
	searchTool := mcp.NewTool("search_notes",
		mcp.WithDescription("对 Note All 知识库进行混合检索（包含向量语义与全文 FTS 检索），获取最相关的知识碎片或文档。"),
		mcp.WithString("query", mcp.Required(), mcp.Description("检索关键词或语义描述")),
		mcp.WithNumber("limit", mcp.Description("最大返回结果数，默认 10 条")),
	)
	s.AddTool(searchTool, handleSearchNotes)

	// 后续 4 个工具详细实现参照 backend/mcp/tools.go
}
```

---

## 7. 测试与连接策略 (Testing & Integration Strategy)

### HTTP SSE 模式集成
Note All MCP 服务端不再受限于 Stdio 的本地管道限制，支持网络上的任何客户端通过标准 **HTTP Server-Sent Events (SSE)** 握手并连接。
- **SSE 握手接口 (GET)**：`http://localhost:3344/sse?token=note-all-mcp-token-123456`
- **消息发送接口 (POST)**：`http://localhost:3344/message?token=note-all-mcp-token-123456`

### 本地集成调试方法
调试 SSE 服务可以通过 MCP Inspector 连接：
```bash
# 使用 MCP Inspector 调试 SSE 服务端
npx -y @modelcontextprotocol/inspector http://localhost:3344/sse?token=note-all-mcp-token-123456
```
> 通过 MCP Inspector 可以可视化查看已注册的 `tools` 和 `resources`，并在网页中模拟 AI 客户端发起调用。

---

## 8. 开发边界 (Boundaries)

### 强制遵守 (Always)
- 运行于 MCP Mode 时，主程序作为独立的 HTTP SSE 守护进程，默认监听 `:3344` 端口。
- **Token 鉴权保护**：必须支持通过 Query 参数 `?token=xxx` 或 `Authorization: Bearer xxx` 请求头进行严格校验，阻断外部不安全访问。
- 复用系统现存的混合检索（vector + sqlite fts5 + tags + recency）主干函数，保证检索效果与系统内置 RAG 机器人高度一致。
- 检索和读取操作必须进行边界过滤：只查 `deleted_at IS NULL` 且状态为 `analyzed/done` 的有效文档。
- **支持文本与图片推送功能**：允许外部 AI 通过 `push_text_note` 和 `push_image_note` 直接向本地知识库追加新知识或剪藏图片，扩展系统的外挂收集流。

### 提前沟通 (Ask first)
- 更改底层 `snow_storage` 核心存储库或 `service.CreateNoteFromReader` 通用入库服务的接口签名。

### 严禁执行 (Never)
- 严禁在 MCP 模式中直接启动前端 React 服务，它们不共享同个端口 and 业务协议。
- 严禁对未经 OCR 提炼、仍处于 `pending` 状态的低质量或空笔记暴露读取。

---

## 9. 验收条件 (Success Criteria)

- [x] **SSE 服务端成功拉起**：运行 `note_all_backend.exe --mcp` 时能成功绑定 `:3344` 端口。
- [x] **Token 安全防护**：未携带 token 访问 `/sse` 拒绝并返回 `401 Unauthorized`。
- [x] **工具功能闭环**：
  - [x] `search_notes` 支持输入 query 并吐出 FTS+向量混合评分排序的 Markdown 格式笔记摘要和 ID。
  - [x] `read_note_by_id` 传入有效 ID，能完美解出 OcrText 正文，无字符流截断、无格式缺失。
  - [x] `get_recent_notes` 支持 `days` 参数过滤（默认3天），且当时间范围内记录少于3条时，能成功触发**自动退避降级**（退避至30天或拉取全量最新纪录），并在返回列表中直观显示 AI 摘要、标签和修改时间。
  - [x] `push_text_note` 推送 Markdown 文本后，能成功返回新创建笔记的 ID，并在后台分析队列中成功排队。
  - [x] `push_image_note` 在传入绝对路径或 Base64 时能无损落库，并成功加入后台 OCR / VLM 视觉大模型理解队列。
- [x] **资源视图闭环**：
  - [x] 访问 `note-all://notes` 能得到整个知识库中有效文档的 JSON-RPC 列表。

---

## 10. 客户端配置示例 (Claude Desktop SSE Setup)

要在本地 Claude Desktop 的 `claude_desktop_config.json` 中配置以 SSE HTTP 模式挂载：
```json
{
  "mcpServers": {
    "note-all-sse": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/client-cli",
        "http://localhost:3344/sse?token=note-all-mcp-token-123456"
      ]
    }
  }
}
```
也可以在 **Cursor / Windsurf** 的 MCP 页面配置类型为 `sse`，连接 URL 输入 `http://localhost:3344/sse?token=note-all-mcp-token-123456`，直接完美通信！

---

*最后更新: 2026-05-06 | Antigravity 团队*
