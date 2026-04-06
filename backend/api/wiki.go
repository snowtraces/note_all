package api

import (
	"fmt"
	"net/http"
	"strconv"

	"note_all_backend/service"

	"github.com/gin-gonic/gin"
)

// WikiApi Wiki 词条管理接口
type WikiApi struct{}

// Create 创建词条（人工）
// POST /api/wiki
// Body: {"title":"概念名","summary":"摘要","body":"正文MD","source_ids":[1,2,3]}
func (a *WikiApi) Create(c *gin.Context) {
	var body struct {
		Title     string `json:"title" binding:"required"`
		Summary   string `json:"summary"`
		Body      string `json:"body"`
		SourceIDs []uint `json:"source_ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	entry, err := service.CreateWikiEntry(body.Title, body.Summary, body.Body, body.SourceIDs)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, entry)
}

// AutoCreate 从碎片中 AI 自动生成词条
// POST /api/wiki/auto
// Body: {"title":"(选填)概念名","source_ids":[1,2,3]}
func (a *WikiApi) AutoCreate(c *gin.Context) {
	var body struct {
		Title     string `json:"title"`
		SourceIDs []uint `json:"source_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 异步执行 AI 合成（避免长时间阻塞请求）
	titleCopy := body.Title
	idsCopy := body.SourceIDs
	go func() {
		if titleCopy != "" {
			// 如果提供了 Title，则合成单个词条
			if _, err := service.AutoCreateWikiFromFragments(titleCopy, idsCopy); err != nil {
				fmt.Println("[Wiki API] AutoCreateWikiFromFragments error:", err)
			}
		} else {
			// 如果没提供 Title，则对每个碎片执行自动发现提炼流程
			fmt.Println("[Wiki API] No title provided, starting autonomous discovery for IDs:", idsCopy)
			for _, id := range idsCopy {
				service.ProcessNoteForWiki(id)
			}
		}
	}()

	c.JSON(http.StatusAccepted, gin.H{"message": "AI 正在自动同步并提炼知识库，请稍后查看 Wiki 列表。"})
}

// List 分页列出词条
// GET /api/wiki?page=1&limit=20&status=published
func (a *WikiApi) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	status := c.Query("status")

	entries, total, err := service.ListWikiEntries(page, limit, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"total":   total,
		"page":    page,
		"limit":   limit,
		"entries": entries,
	})
}

// Get 获取词条详情
// GET /api/wiki/:id
func (a *WikiApi) Get(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ID"})
		return
	}

	entry, err := service.GetWikiEntry(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, entry)
}

// Update 更新词条内容
// PATCH /api/wiki/:id
// Body: {"title":"...","summary":"...","body":"...","status":"published"}
func (a *WikiApi) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ID"})
		return
	}

	var body struct {
		Title   string `json:"title"`
		Summary string `json:"summary"`
		Body    string `json:"body"`
		Status  string `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	entry, err := service.UpdateWikiEntry(uint(id), body.Title, body.Summary, body.Body, body.Status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, entry)
}

// AddSource 为词条追加来源碎片
// POST /api/wiki/:id/source
// Body: {"note_id": 42}
func (a *WikiApi) AddSource(c *gin.Context) {
	wikiID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 wiki ID"})
		return
	}

	var body struct {
		NoteID uint `json:"note_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := service.AddWikiSource(uint(wikiID), body.NoteID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Delete 软删除词条
// DELETE /api/wiki/:id
func (a *WikiApi) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ID"})
		return
	}

	if err := service.DeleteWikiEntry(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetVersions 获取词条历史版本列表
// GET /api/wiki/:id/versions
func (a *WikiApi) GetVersions(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 ID"})
		return
	}

	versions, err := service.GetWikiVersions(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"versions": versions})
}
