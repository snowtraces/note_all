package api

import (
	"net/http"
	"sync"
	"time"

	"note_all_backend/global"
	"note_all_backend/service"

	"github.com/gin-gonic/gin"
)

// ReviewApi 每日回顾相关接口
type ReviewApi struct{}

var (
	lastReviewTime time.Time
	reviewMu       sync.Mutex
)

// GenerateReview 触发每日回顾异步生成（60s 内防重复提交）
func (a *ReviewApi) GenerateReview(c *gin.Context) {
	reviewMu.Lock()
	if time.Since(lastReviewTime) < 60*time.Second {
		reviewMu.Unlock()
		c.JSON(http.StatusTooManyRequests, gin.H{"message": "回顾生成过于频繁，请稍后再试"})
		return
	}
	lastReviewTime = time.Now()
	reviewMu.Unlock()

	global.WorkerChan <- func() {
		service.GenerateDailyReview()
	}
	c.JSON(http.StatusOK, gin.H{"message": "回顾生成中"})
}

// GetLatestReview 获取最新回顾
func (a *ReviewApi) GetLatestReview(c *gin.Context) {
	review, err := service.GetLatestReview()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": review})
}
