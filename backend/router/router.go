package router

import (
	"net/http"

	"note_all_backend/api"

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

	apiGroup := r.Group("/api")
	noteApi := new(api.NoteApi)
	templateApi := new(api.TemplateApi)

	{
		// 1. 上传文件生成新解析工单
		apiGroup.POST("/upload", noteApi.Upload)

		// 2. 纯文本缺口（跳过 OCR，直接 LLM 摘要+标签）
		apiGroup.POST("/note/text", noteApi.CreateFromText)

		// 2. 根据自签名 SnowStorage ID 下潜读取物理对象返回
		apiGroup.GET("/file/:id", noteApi.GetFile)

		// 3. FTS5 分词极速高亮检索（支持 # 标签模式）
		apiGroup.GET("/search", noteApi.Search)

		// 4. 回收站机制 (逻辑删除与恢复)
		apiGroup.DELETE("/note/:id", noteApi.SoftDelete)
		apiGroup.POST("/note/:id/restore", noteApi.Restore)
		apiGroup.DELETE("/note/:id/hard", noteApi.HardDelete)
		apiGroup.GET("/trash", noteApi.Trash)

		// 4.5 更新已有文本碎片内容
		apiGroup.PATCH("/note/:id/text", noteApi.UpdateText)

		// 5. 标签接口
		apiGroup.GET("/tags", noteApi.GetTags)

		// 6. RAG 会话与每日回顾
		apiGroup.POST("/ask", noteApi.Ask)
		apiGroup.GET("/chat/sessions", noteApi.ListChatSessions)
		apiGroup.GET("/chat/session/:id", noteApi.GetChatMessages)
		apiGroup.DELETE("/chat/session/:id", noteApi.DeleteChatSession)

		// 7. 灵感与拼图 (Phase 3)
		apiGroup.GET("/serendipity", noteApi.Serendipity)

		// 8. 相关灵感关联 (Phase 4)
		apiGroup.GET("/note/:id/related", noteApi.RelatedNotes)

		// 9. 重新用 AI 处理 (使用当前激活模板)
		apiGroup.POST("/note/:id/reprocess", noteApi.ReprocessNote)

		// 10. AI 处理模板管理
		apiGroup.GET("/templates", templateApi.List)
		apiGroup.POST("/templates", templateApi.Create)
		apiGroup.PUT("/templates/:id", templateApi.Update)
		apiGroup.DELETE("/templates/:id", templateApi.Delete)
		apiGroup.POST("/templates/:id/active", templateApi.SetActive)
	}

	return r
}
