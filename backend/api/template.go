package api

import (
	"net/http"

	"note_all_backend/global"
	"note_all_backend/models"

	"github.com/gin-gonic/gin"
)

type TemplateApi struct{}

// List 返回所有模板
func (a *TemplateApi) List(c *gin.Context) {
	var templates []models.PromptTemplate
	if err := global.DB.Order("id asc").Find(&templates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取模板列表失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": templates})
}

// Create 创建新模板
func (a *TemplateApi) Create(c *gin.Context) {
	var body struct {
		Name         string `json:"name" binding:"required"`
		SystemPrompt string `json:"system_prompt" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	tpl := models.PromptTemplate{
		Name:         body.Name,
		SystemPrompt: body.SystemPrompt,
		IsActive:     false,
		IsBuiltin:    false,
	}
	if err := global.DB.Create(&tpl).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建模板失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "创建成功", "data": tpl})
}

// Update 更新模板
func (a *TemplateApi) Update(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Name         string `json:"name" binding:"required"`
		SystemPrompt string `json:"system_prompt" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var tpl models.PromptTemplate
	if err := global.DB.First(&tpl, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}

	if tpl.IsBuiltin {
		c.JSON(http.StatusBadRequest, gin.H{"error": "内置模板不可修改"})
		return
	}

	if err := global.DB.Model(&tpl).Updates(map[string]interface{}{
		"name":          body.Name,
		"system_prompt": body.SystemPrompt,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新模板失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "更新成功", "data": tpl})
}

// Delete 删除模板
func (a *TemplateApi) Delete(c *gin.Context) {
	id := c.Param("id")
	
	var tpl models.PromptTemplate
	if err := global.DB.First(&tpl, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}

	if tpl.IsBuiltin {
		c.JSON(http.StatusBadRequest, gin.H{"error": "内置模板不可删除"})
		return
	}
	// 如果删除的是激活模板，需将会激活装态转移给默认模板
	wasActive := tpl.IsActive

	if err := global.DB.Unscoped().Delete(&tpl).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}

	if wasActive {
		global.DB.Model(&models.PromptTemplate{}).Where("id = ?", 1).Update("is_active", true)
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// SetActive 设置激活的模板
func (a *TemplateApi) SetActive(c *gin.Context) {
	id := c.Param("id")
	
	var tpl models.PromptTemplate
	if err := global.DB.First(&tpl, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "模板不存在"})
		return
	}

	// 取消其他所有模板的激活状态
	global.DB.Model(&models.PromptTemplate{}).Where("is_active = ?", true).Update("is_active", false)
	// 激活动前模板
	global.DB.Model(&tpl).Update("is_active", true)

	c.JSON(http.StatusOK, gin.H{"message": "设置激活模板成功"})
}
