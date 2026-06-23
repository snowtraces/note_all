package api

import (
	"log"
	"net/http"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/service"

	"github.com/gin-gonic/gin"
)

type WikiApi struct{}

func (w *WikiApi) GetPending(c *gin.Context) {
	var tasks []models.PendingWikiTask
	if err := global.DB.Where("status = ?", "pending").Find(&tasks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
		return
	}
	c.JSON(http.StatusOK, tasks)
}

func (w *WikiApi) Compile(c *gin.Context) {
	var req struct {
		TaskID uint `json:"task_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	// 异步编译，避免阻塞 API 请求过长
	go func() {
		log.Printf("[Wiki] 开始后台编译任务 ID: %d", req.TaskID)
		err := service.CompileWikiConcept(req.TaskID)
		if err != nil {
			log.Printf("[Wiki] 编译任务 ID %d 失败: %v", req.TaskID, err)
			global.DB.Model(&models.PendingWikiTask{}).Where("id = ?", req.TaskID).Update("status", "pending")
		} else {
			log.Printf("[Wiki] 编译任务 ID %d 完成", req.TaskID)
		}
	}()
	
	c.JSON(http.StatusOK, gin.H{"message": "已在后台启动编译任务"})
}

func (w *WikiApi) Reject(c *gin.Context) {
	var req struct {
		TaskID uint `json:"task_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := service.RejectWikiConcept(req.TaskID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已忽略"})
}

func (w *WikiApi) GetRelated(c *gin.Context) {
	noteID := c.Query("note_id")
	if noteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "note_id required"})
		return
	}

	var wikis []models.WikiEntity
	err := global.DB.Joins("JOIN wiki_references ON wiki_references.wiki_entity_id = wiki_entities.id").
		Where("wiki_references.note_id = ?", noteID).
		Find(&wikis).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, wikis)
}

func (w *WikiApi) GetAllWikis(c *gin.Context) {
	var wikis []models.WikiEntity
	if err := global.DB.Order("updated_at DESC").Find(&wikis).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取百科列表失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": wikis})
}

func (w *WikiApi) GetWikiDetail(c *gin.Context) {
	id := c.Param("id")
	var wiki models.WikiEntity
	if err := global.DB.First(&wiki, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "找不到该词条"})
		return
	}

	// 获取关联笔记
	var notes []models.NoteItem
	global.DB.Joins("JOIN wiki_references ON wiki_references.note_id = note_items.id").
		Where("wiki_references.wiki_entity_id = ?", id).
		Find(&notes)

	c.JSON(http.StatusOK, gin.H{
		"data":       wiki,
		"references": notes,
	})
}

func (w *WikiApi) DeleteWiki(c *gin.Context) {
	id := c.Param("id")

	tx := global.DB.Begin()

	// 0. 先获取词条名称，用于后续清理 PendingWikiTask
	var wiki models.WikiEntity
	if err := tx.First(&wiki, id).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"error": "词条不存在"})
		return
	}

	// 1. 删除关联的 WikiReference
	if err := tx.Where("wiki_entity_id = ?", id).Delete(&models.WikiReference{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除关联引用失败"})
		return
	}

	// 2. 清理 PendingWikiTask 中的幽灵记录，防止嗅探器未来跳过该概念名
	tx.Where("concept_name = ?", wiki.Name).Delete(&models.PendingWikiTask{})

	// 3. 硬删除 WikiEntity 本身
	if err := tx.Unscoped().Where("id = ?", id).Delete(&models.WikiEntity{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除词条失败"})
		return
	}

	tx.Commit()
	c.JSON(http.StatusOK, gin.H{"message": "词条已删除"})
}

func (w *WikiApi) MergeWiki(c *gin.Context) {
	var req struct {
		SourceID uint `json:"source_id"`
		TargetID uint `json:"target_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if req.SourceID == req.TargetID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "源词条和目标词条不能相同"})
		return
	}

	tx := global.DB.Begin()

	// 1. 获取两者的信息
	var sourceWiki, targetWiki models.WikiEntity
	if err := tx.First(&sourceWiki, req.SourceID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"error": "源词条不存在"})
		return
	}
	if err := tx.First(&targetWiki, req.TargetID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusNotFound, gin.H{"error": "目标词条不存在"})
		return
	}

	// 2. 迁移 Reference 关联
	var sourceRefs []models.WikiReference
	if err := tx.Where("wiki_entity_id = ?", req.SourceID).Find(&sourceRefs).Error; err == nil {
		for _, ref := range sourceRefs {
			// 检查目标词条是否已经有该笔记的关联
			var existing models.WikiReference
			tx.Where("wiki_entity_id = ? AND note_id = ?", req.TargetID, ref.NoteID).Limit(1).Find(&existing)
			if existing.ID == 0 {
				tx.Model(&ref).Update("wiki_entity_id", req.TargetID)
			} else {
				tx.Unscoped().Delete(&ref) // 删除冗余引用
			}
		}
	}

	// 3. 清理源词条对应的 PendingWikiTask 幽灵记录
	tx.Where("concept_name = ?", sourceWiki.Name).Delete(&models.PendingWikiTask{})

	// 4. 删除源词条
	if err := tx.Unscoped().Delete(&models.WikiEntity{}, req.SourceID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除源词条失败"})
		return
	}

	tx.Commit()

	// 5. 后台启动 LLM 融合任务
	go service.MergeWikiContentBackground(req.TargetID, sourceWiki.Name, sourceWiki.Content)

	c.JSON(http.StatusOK, gin.H{"message": "词条结构已合并，后台正在进行正文重写"})
}
