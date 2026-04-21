package api

import (
	"fmt"
	"time"

	"note_all_backend/global"

	"github.com/gin-gonic/gin"
)

type SSEApi struct{}

// StreamEvents SSE 实时推送端点，通知前端数据变化
func (a *SSEApi) StreamEvents(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	// 订阅全局事件
	ch := global.SSEBus.Subscribe()
	defer global.SSEBus.Unsubscribe(ch)

	// 心跳定时器，防止代理超时断开
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case event := <-ch:
			c.Writer.WriteString(fmt.Sprintf("data: %s\n\n", event))
			c.Writer.Flush()
		case <-heartbeat.C:
			// SSE 注释形式的心跳，不触发前端 onmessage
			c.Writer.WriteString(": heartbeat\n\n")
			c.Writer.Flush()
		case <-c.Request.Context().Done():
			// 客户端断开连接
			return
		}
	}
}