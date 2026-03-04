package router

import (
	"net/http"

	"note_all_backend/api"

	"github.com/gin-gonic/gin"
)

// SetupRouter 组装与注册系统所有 API 路由
func SetupRouter() *gin.Engine {
	r := gin.Default()

	// 心跳检测接口
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "pong"})
	})

	apiGroup := r.Group("/api")
	noteApi := new(api.NoteApi)

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

		// 5. 标签接口
		apiGroup.GET("/tags", noteApi.GetTags)
	}

	return r
}
