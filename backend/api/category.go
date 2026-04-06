package api

import (
	"net/http"
	"strconv"
	"time"

	"note_all_backend/service"

	"github.com/gin-gonic/gin"
)

// CategoryApi 知识分类管理接口
type CategoryApi struct{}

// SetDocCategory 手动将碎片标记为 DOC 文件
// PATCH /api/note/:id/category
// Body: {"doc_sub_type": "contract", "doc_expire_at": "2027-01-01T00:00:00Z"}
func (a *CategoryApi) SetDocCategory(c *gin.Context) {
	id := c.Param("id")

	var body struct {
		DocSubType  string  `json:"doc_sub_type" binding:"required"`
		DocExpireAt *string `json:"doc_expire_at"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}

	var expireAt *time.Time
	if body.DocExpireAt != nil && *body.DocExpireAt != "" {
		t, err := time.Parse(time.RFC3339, *body.DocExpireAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "doc_expire_at 格式错误，请使用 RFC3339 格式 (e.g. 2027-01-01T00:00:00Z)"})
			return
		}
		expireAt = &t
	}

	if err := service.SetNoteCategory(id, body.DocSubType, expireAt); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ResetCategory 将碎片分类重置为普通 fragment
// DELETE /api/note/:id/category
func (a *CategoryApi) ResetCategory(c *gin.Context) {
	id := c.Param("id")
	if err := service.ResetNoteCategory(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ListByCategory 按分类列出碎片，支持分页
// GET /api/notes/category/:type?page=1&limit=20
// :type = fragment | pic | doc | doc_suggested
func (a *CategoryApi) ListByCategory(c *gin.Context) {
	category := c.Param("type")
	if category == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要指定分类类型"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	items, total, err := service.ListByCategory(category, page, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"total": total,
		"page":  page,
		"limit": limit,
		"items": items,
	})
}
