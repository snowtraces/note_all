package api

import (
	"fmt"
	"net/http"
	"note_all_backend/service"
	"strconv"

	"github.com/gin-gonic/gin"
)

type ShareApi struct{}

// CreateShare 生成分享链接
func (a *ShareApi) CreateShare(c *gin.Context) {
	var body struct {
		NoteID     uint `json:"note_id" binding:"required"`
		ExpireDays int  `json:"expire_days"` // 0 为永不过期
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误 " + err.Error()})
		return
	}

	link, err := service.GenerateShareLink(body.NoteID, body.ExpireDays)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成分享链接失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "分享链接生成成功",
		"data":    link,
		"url":     fmt.Sprintf("/s/%s", link.ID), // 这里的地址给前端路由使用
	})
}

// GetPublicShare 获取分享详情 (公开接口)
func (a *ShareApi) GetPublicShare(c *gin.Context) {
	id := c.Param("id")
	note, err := service.GetSharedNote(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	// 返回笔记脱敏数据
	c.JSON(http.StatusOK, gin.H{
		"data": note,
	})
}

// RevokeShare 撤销分享
func (a *ShareApi) RevokeShare(c *gin.Context) {
	id := c.Param("id")
	if err := service.RevokeShareLink(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "撤销失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已成功撤销分享链接"})
}

// ListNoteShares 获取某个笔记的所有分享链接
func (a *ShareApi) ListNoteShares(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.ParseUint(idStr, 10, 32)
	
	links, err := service.GetNoteShareLinks(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取分享列表失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": links,
	})
}
