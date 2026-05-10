package router

import (
	"net/http"
	"strings"

	"note_all_backend/api"
	"note_all_backend/global"
	"note_all_backend/mcp"
	"note_all_backend/middleware"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

// SetupRouter 组装与注册系统所有 API 路由
func SetupRouter() *gin.Engine {
	r := gin.Default()
	r.Use(gzip.Gzip(gzip.DefaultCompression,
		gzip.WithExcludedExtensions([]string{".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".woff2"}),
		gzip.WithExcludedPaths([]string{"/api/stream", "/sse", "/message"}),
	))
	// CORS 中间件
	r.Use(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		allowedOrigins := []string{"http://localhost:5173", "http://localhost:3344", "http://127.0.0.1:5173", "http://127.0.0.1:3344"}
		for _, o := range allowedOrigins {
			if o != "" && o == origin {
				c.Writer.Header().Set("Access-Control-Allow-Origin", o)
				break
			}
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE, PATCH")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// ============== MCP (Model Context Protocol) 引擎内置集成 ==============
	// 初始化 MCP SSE 传输后端
	sseServer := mcp.InitSSEServer()

	// 缓存鉴权 Token
	mcpToken := global.Config.McpToken
	if mcpToken == "" {
		mcpToken = global.Config.SysPassword
	}
	if mcpToken == "" {
		mcpToken = "note-all-mcp-token-123456"
	}

	authHandler := func(c *gin.Context) {
		// 校验令牌 (支持 Query ?token=xxx 或 Authorization Bearer Header)
		token := c.Query("token")
		if token == "" {
			authHeader := c.GetHeader("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if token != mcpToken {
			c.String(http.StatusUnauthorized, "Unauthorized: Invalid or missing MCP token")
			c.Abort()
			return
		}

		// 注入 SSE 与防缓冲响应头，保证长连接不被反向代理、CDN 或中间层断开
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")      // 彻底关闭 Nginx 等反向代理的缓存缓冲
		c.Header("Content-Encoding", "identity") // 明确通知 Cloudflare 等 CDN 绝对不要对此流进行压缩，直接直通，彻底避免边缘缓冲

		// 路由鉴权通过，直接转交给 mcp-go 的 SSE 传输引擎接管（此时已彻底绕过 Gzip 压缩，确保 100% 原生 Flusher 畅通）
		sseServer.ServeHTTP(c.Writer, c.Request)
	}

	// 绑定 MCP 核心路由（由外部 AI 工具流直接订阅连接）
	r.GET("/sse", authHandler)
	r.POST("/message", authHandler)

	// 心跳检测接口
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "pong"})
	})

	authApi := new(api.AuthApi)
	shareApi := new(api.ShareApi)
	serverApi := new(api.ServerApi)

	// 1. 公开接口 (不需要鉴权)
	r.POST("/api/auth/login", authApi.Login)
	r.GET("/api/pub/share/:id", shareApi.GetPublicShare) // 这里是真正的公开分享端点
	r.GET("/api/server/addresses", serverApi.GetAddresses) // 获取服务器可用地址列表

	noteApi := new(api.NoteApi)
	r.GET("/api/file/:id", noteApi.GetFile) // 本地图片公开访问

	// 2. 需要鉴权的接口组
	apiGroup := r.Group("/api")
	apiGroup.Use(middleware.AuthRequired())
	{
		apiGroup.GET("/auth/check", authApi.Check) // 校验 Token 有效性

		// ============== SSE 实时推送 ==============
		sseApi := new(api.SSEApi)
		apiGroup.GET("/stream", sseApi.StreamEvents)

		// ============== 分享管理 (保护) ==============
		apiGroup.POST("/share", shareApi.CreateShare)
		apiGroup.DELETE("/share/:id", shareApi.RevokeShare)
		apiGroup.GET("/note/:id/shares", shareApi.ListNoteShares)

		weixinApi := new(api.WeixinApi)
		apiGroup.GET("/weixin/bot", weixinApi.GetBot)
		apiGroup.POST("/weixin/bot/toggle", weixinApi.ToggleBot)
		apiGroup.DELETE("/weixin/bot", weixinApi.LogoutBot)
		apiGroup.GET("/weixin/qrcode", weixinApi.GetQRCode)
		apiGroup.GET("/weixin/status", weixinApi.CheckStatus)
		apiGroup.GET("/weixin/messages", weixinApi.ListMessages)
		apiGroup.POST("/weixin/send", weixinApi.SendManualReply)

		templateApi := new(api.TemplateApi)
		agentApi := new(api.AgentApi)
		reviewApi := new(api.ReviewApi)

		// 1. 上传文件生成新解析工单
		apiGroup.POST("/upload", noteApi.Upload)
		// ...

		// 2. 纯文本缺口（跳过 OCR，直接 LLM 摘要+标签）
		apiGroup.POST("/note/text", noteApi.CreateFromText)

		// 3. 混合检索
		apiGroup.GET("/search", noteApi.Search)
		apiGroup.POST("/search", noteApi.Search)

		// 4. 详细内容查询与更新
		apiGroup.PATCH("/note/:id/text", noteApi.UpdateText)
		apiGroup.GET("/note/:id", noteApi.GetNote)
		apiGroup.PATCH("/note/:id/status", noteApi.UpdateStatus)
		apiGroup.PATCH("/note/batch/archive", noteApi.BatchArchive)
		apiGroup.GET("/note/:id/related", noteApi.RelatedNotes)
		apiGroup.DELETE("/note/:id/hard", noteApi.HardDelete)
		apiGroup.GET("/trash", noteApi.Trash)

		// 4. 回收站机制 (逻辑删除与恢复)
		apiGroup.DELETE("/note/:id", noteApi.SoftDelete)
		apiGroup.POST("/note/:id/restore", noteApi.Restore)

		// 5. 标签接口
		apiGroup.GET("/tags", noteApi.GetTags)

		// 6. RAG 会话与每日回顾
		apiGroup.POST("/ask", noteApi.Ask)
		apiGroup.POST("/ai/ask", noteApi.Ask)
		apiGroup.GET("/chat/sessions", noteApi.ListChatSessions)
		apiGroup.GET("/chat/session/:id", noteApi.GetChatMessages)
		apiGroup.DELETE("/chat/session/:id", noteApi.DeleteChatSession)

		// 6.5 Agent 多轮对话
		apiGroup.POST("/agent/ask", agentApi.AgentAsk)
		apiGroup.GET("/agent/sessions", agentApi.ListAgentSessions)
		apiGroup.GET("/agent/session/:id", agentApi.GetAgentSessionMessages)
		apiGroup.DELETE("/agent/session/:id", agentApi.DeleteAgentSession)

		// 7. 灵感与拼图 (Phase 3)
		apiGroup.GET("/serendipity", noteApi.Serendipity)

		// 7.5 每日回顾 (Phase A2)
		apiGroup.POST("/review/daily", reviewApi.GenerateReview)
		apiGroup.GET("/review/latest", reviewApi.GetLatestReview)

		// 9. 重新用 AI 处理 (使用当前激活模板)
		apiGroup.POST("/note/:id/reprocess", noteApi.ReprocessNote)

		// 9.1 知识合成 (Knowledge Lab)
		apiGroup.POST("/note/synthesize", noteApi.Synthesize)
		apiGroup.POST("/note/synthesize/save", noteApi.SaveSynthesized)

		// 9.2 图片上传（独立接口，用于图片本地化）
		apiGroup.POST("/image/upload", noteApi.UploadImage)
		apiGroup.POST("/image/upload_from_url", noteApi.UploadImageFromURL)

		// 9.3 独立模块：生图
		imageGenApi := new(api.ImageGenerationApi)
		apiGroup.POST("/image_gen/create", imageGenApi.Generate)
		apiGroup.GET("/image_gen/history", imageGenApi.List)
		apiGroup.POST("/image_gen/:id/archive", imageGenApi.ToggleArchive)

		// 9.5 知识图谱数据
		apiGroup.GET("/graph", noteApi.GetGraph)

		// 10. AI 处理模板管理
		apiGroup.GET("/templates", templateApi.List)
		apiGroup.POST("/templates", templateApi.Create)
		apiGroup.PUT("/templates/:id", templateApi.Update)
		apiGroup.DELETE("/templates/:id", templateApi.Delete)
		apiGroup.POST("/templates/:id/active", templateApi.SetActive)

		// 11. 系统管理
		systemApi := new(api.SystemApi)
		apiGroup.GET("/system/embedding/status", systemApi.GetEmbeddingStatus)
		apiGroup.POST("/system/embedding/rebuild", systemApi.RebuildEmbeddings)
		apiGroup.POST("/system/synonym/sync", systemApi.SyncSynonyms)
		apiGroup.GET("/system/synonym/status", systemApi.GetSynonymStatus)

		// 12. 定时任务及网页匹配规则管理 (Phase E1)
		cronApi := new(api.CronApi)
		apiGroup.GET("/cron-tasks", cronApi.ListTasks)
		apiGroup.POST("/cron-tasks", cronApi.CreateTask)
		apiGroup.PUT("/cron-tasks/:id", cronApi.UpdateTask)
		apiGroup.DELETE("/cron-tasks/:id", cronApi.DeleteTask)
		apiGroup.PUT("/cron-tasks/:id/toggle", cronApi.ToggleTask)
		apiGroup.POST("/cron-tasks/:id/run", cronApi.RunTask)
		apiGroup.GET("/cron-tasks/:id/logs", cronApi.GetTaskLogs)

		apiGroup.GET("/extractor-rules", cronApi.ListRules)
		apiGroup.POST("/extractor-rules", cronApi.CreateRule)
		apiGroup.PUT("/extractor-rules/:id", cronApi.UpdateRule)
		apiGroup.DELETE("/extractor-rules/:id", cronApi.DeleteRule)
		apiGroup.POST("/extractor-rules/test", cronApi.TestRule)

		apiGroup.GET("/cron-settings", cronApi.GetSettings)
		apiGroup.PUT("/cron-settings", cronApi.UpdateSettings)
	}

	// ====================== 静态资源与 SPA 路由逻辑 ======================
	// 1. 映射后端能够识别的静态资源目录 (假设前端构建代码位于 ../frontend/dist)
	staticPath := "../frontend/dist"
	r.Static("/assets", staticPath+"/assets")
	r.StaticFile("/favicon.ico", staticPath+"/favicon.ico")
	r.StaticFile("/manifest.json", staticPath+"/manifest.json")

	// 2. 兜底逻辑：对于非 /api 开头的其他路径，统一返回 index.html
	// 这样可以交由前端的 react-router 处理具体的动态 URL
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		// 如果是 API 路径但找不到，直接报 404
		if strings.HasPrefix(path, "/api") {
			c.JSON(http.StatusNotFound, gin.H{"error": "API Route Not Found"})
			return
		}
		// 其他路径统统给 index.html
		c.File(staticPath + "/index.html")
	})

	return r
}
