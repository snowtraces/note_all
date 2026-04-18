package api

import (
	"log"
	"net/http"
	"sync"

	"note_all_backend/global"
	"note_all_backend/service"

	"github.com/gin-gonic/gin"
)

type SystemApi struct{}

var rebuildMu sync.Mutex
var rebuildRunning bool

// RebuildEmbeddings 清空并重建所有向量索引
func (s *SystemApi) RebuildEmbeddings(c *gin.Context) {
	rebuildMu.Lock()
	if rebuildRunning {
		rebuildMu.Unlock()
		c.JSON(http.StatusConflict, gin.H{"error": "向量重建正在进行中，请稍后再试"})
		return
	}
	rebuildRunning = true
	rebuildMu.Unlock()

	go func() {
		defer func() {
			rebuildMu.Lock()
			rebuildRunning = false
			rebuildMu.Unlock()
		}()

		log.Println("[System] 向量全量重建任务开始...")
		global.DB.Exec("DELETE FROM note_embeddings")

		if err := service.BackfillNoteEmbeddings(); err != nil {
			log.Printf("[System] 向量重建失败: %v", err)
		} else {
			log.Println("[System] 向量全量重建完毕。")
		}
	}()

	c.JSON(http.StatusOK, gin.H{"message": "向量重建任务已启动，将在后台执行"})
}

// GetEmbeddingStatus 获取向量索引状态
func (s *SystemApi) GetEmbeddingStatus(c *gin.Context) {
	var total int64
	global.DB.Raw("SELECT COUNT(*) FROM note_embeddings").Scan(&total)

	var noteTotal int64
	global.DB.Raw("SELECT COUNT(*) FROM note_items WHERE status IN ('analyzed', 'done') AND deleted_at IS NULL").Scan(&noteTotal)

	rebuildMu.Lock()
	running := rebuildRunning
	rebuildMu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"embedding_count": total,
		"note_count":      noteTotal,
		"is_rebuilding":   running,
		"vector_ext":      global.VectorExtLoaded,
		"model_id":        global.Config.EmbeddingModelID,
	})
}
