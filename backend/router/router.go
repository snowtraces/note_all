package router

import (
	"net/http"
	"strings"

	"note_all_backend/api"
	"note_all_backend/middleware"

	"github.com/gin-gonic/gin"
)

// SetupRouter 组装与注册系统所有 API 路由
func SetupRouter() *gin.Engine {
	r := gin.Default()
	// CORS 中间件
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE, PATCH")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// 心跳检测接口
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "pong"})
	})

	authApi := new(api.AuthApi)
	shareApi := new(api.ShareApi)

	// 1. 公开接口 (不需要鉴权)
	r.POST("/api/auth/login", authApi.Login)
	r.GET("/api/pub/share/:id", shareApi.GetPublicShare) // 这里是真正的公开分享端点

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

		noteApi := new(api.NoteApi)
		templateApi := new(api.TemplateApi)
		agentApi := new(api.AgentApi)

		// 1. 上传文件生成新解析工单
		apiGroup.POST("/upload", noteApi.Upload)
		// ...

		// 2. 纯文本缺口（跳过 OCR，直接 LLM 摘要+标签）
		apiGroup.POST("/note/text", noteApi.CreateFromText)

		// 2. 根据自签名 SnowStorage ID 下潜读取物理对象返回
		apiGroup.GET("/file/:id", noteApi.GetFile)

		// 3. 混合检索
		apiGroup.GET("/search", noteApi.Search)
		apiGroup.POST("/search", noteApi.Search)

		// 4. 详细内容查询与更新
		apiGroup.PATCH("/note/:id/text", noteApi.UpdateText)
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

		// 9. 重新用 AI 处理 (使用当前激活模板)
		apiGroup.POST("/note/:id/reprocess", noteApi.ReprocessNote)

		// 9.1 知识合成 (Knowledge Lab)
		apiGroup.POST("/note/synthesize", noteApi.Synthesize)
		apiGroup.POST("/note/synthesize/save", noteApi.SaveSynthesized)

		// 9.2 图片上传（独立接口，用于图片本地化）
		apiGroup.POST("/image/upload", noteApi.UploadImage)

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
