package api

import (
	"log"
	"net/http"
	"path/filepath"
	"sync"

	"note_all_backend/global"
	"note_all_backend/pkg/synonym"
	"note_all_backend/service"

	"github.com/gin-gonic/gin"
)

type SystemApi struct{}

var rebuildMu sync.Mutex
var rebuildRunning bool

var synonymMu sync.Mutex
var synonymRunning bool

// SyncSynonyms 手动同步同义词词典
func (s *SystemApi) SyncSynonyms(c *gin.Context) {
	if global.Config.SysPassword == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "系统未配置密码，无法执行敏感操作"})
		return
	}
	userID, exists := c.Get("user_id")
	if !exists || userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权访问"})
		return
	}

	synonymMu.Lock()
	if synonymRunning {
		synonymMu.Unlock()
		c.JSON(http.StatusConflict, gin.H{"error": "同义词同步正在进行中，请稍后再试"})
		return
	}
	synonymRunning = true
	synonymMu.Unlock()

	go func() {
		defer func() {
			synonymMu.Lock()
			synonymRunning = false
			synonymMu.Unlock()
		}()

		synonymFile := filepath.Join(".", "哈工大社会计算与信息检索研究中心同义词词林扩展版.txt")
		if err := synonym.ImportSynonyms(synonymFile); err != nil {
			log.Printf("[Synonym] 导入同义词失败: %v", err)
		}
	}()

	c.JSON(http.StatusOK, gin.H{"message": "同义词同步任务已启动，将在后台执行"})
}

// GetSynonymStatus 获取同义词状态
func (s *SystemApi) GetSynonymStatus(c *gin.Context) {
	var synonymCount int64
	global.DB.Raw("SELECT COUNT(*) FROM synonyms").Scan(&synonymCount)

	var groupCount int64
	global.DB.Raw("SELECT COUNT(DISTINCT group_id) FROM synonyms").Scan(&groupCount)

	synonymMu.Lock()
	running := synonymRunning
	synonymMu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"synonym_count": synonymCount,
		"group_count":   groupCount,
		"is_syncing":    running,
	})
}

// RebuildEmbeddings 清空并重建所有向量索引（包含分片向量）
// 需要认证且系统密码已配置才能触发（防止未授权的资源消耗操作）
func (s *SystemApi) RebuildEmbeddings(c *gin.Context) {
	// 安全检查：必须配置密码且用户已认证
	if global.Config.SysPassword == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "系统未配置密码，无法执行敏感操作"})
		return
	}
	userID, exists := c.Get("user_id")
	if !exists || userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权访问"})
		return
	}

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

		log.Println("[System] 分片向量全量重建任务开始...")
		// 清空分片向量
		global.DB.Exec("DELETE FROM note_chunk_embeddings")
		global.DB.Exec("DELETE FROM note_chunks")

		// 重建分片向量
		if err := service.BackfillNoteChunks(); err != nil {
			log.Printf("[System] 分片向量重建失败: %v", err)
		} else {
			log.Println("[System] 分片向量全量重建任务完成")
		}
	}()

	c.JSON(http.StatusOK, gin.H{"message": "向量重建任务已启动，将在后台执行"})
}

// GetEmbeddingStatus 获取向量索引状态
func (s *SystemApi) GetEmbeddingStatus(c *gin.Context) {
	var chunkTotal int64
	global.DB.Raw("SELECT COUNT(*) FROM note_chunk_embeddings").Scan(&chunkTotal)

	var noteTotal int64
	global.DB.Raw("SELECT COUNT(*) FROM note_items WHERE status IN ('analyzed', 'done') AND deleted_at IS NULL").Scan(&noteTotal)

	rebuildMu.Lock()
	running := rebuildRunning
	rebuildMu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"chunk_count":       chunkTotal,
		"note_count":        noteTotal,
		"is_rebuilding":     running,
		"vector_ext":        global.VectorExtLoaded,
		"model_id":          global.Config.EmbeddingModelID,
		"chunk_max_size":    global.Config.ChunkMaxSize,
		"rag_context_limit": global.Config.RagContextLimit,
	})
}
