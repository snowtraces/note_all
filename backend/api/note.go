package api

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type NoteApi struct{}

// normalizeQueryForFTS 归一化用户检索词，去掉问句前缀/后缀，避免中文分词导致命中失败。
// 例如 “如何导出” 会被转成 “导出”，避免 FTS 必须匹配整段问句。
func normalizeQueryForFTS(q string) string {
	q = strings.TrimSpace(q)
	q = strings.ReplaceAll(q, "\"", "")
	q = strings.ReplaceAll(q, "'", "")
	q = strings.TrimSpace(q)

	// 去掉常见问句前缀
	prefixes := []string{"如何", "怎么", "怎样", "请问", "为什么", "能否", "是否", "哪里", "啥", "是什么", "能不能"}
	for _, p := range prefixes {
		if strings.HasPrefix(q, p) {
			q = strings.TrimSpace(strings.TrimPrefix(q, p))
			break
		}
	}

	// 去掉常见问句后缀
	if q != "" {
		runes := []rune(q)
		last := runes[len(runes)-1]
		if last == '吗' || last == '呢' || last == '嘛' {
			q = strings.TrimSpace(string(runes[:len(runes)-1]))
		}
	}

	if q == "" {
		return strings.TrimSpace(q)
	}
	return q
}

// Upload 处理前端传递来的 Multipart File 请求
func (a *NoteApi) Upload(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "获取不到上传文件"})
		return
	}

	// 调用服务层承接复杂的落库流程
	note, err := service.UploadAndCreateNote(fileHeader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "上传成功，正在后台解析...",
		"data":    note,
	})
}

// CreateFromText 接受纯文本 JSON，跳过 OCR 直接走 LLM 摘要+标签
func (a *NoteApi) CreateFromText(c *gin.Context) {
	var body struct {
		Text string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 text 参数"})
		return
	}

	note, err := service.CreateNoteFromText(body.Text)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "文本录入成功，正在后台提炼...",
		"data":       note,
		"storage_id": note.StorageID,
	})
}

// UpdateText 修改已有碎片的文本记录
func (a *NoteApi) UpdateText(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Text string `json:"text"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数解析失败"})
		return
	}

	if err := service.UpdateNoteText(id, body.Text); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新文本失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "修改文本成功，正在后台重新提炼分析..."})
}

// GetFile 接受存储 ID 还原图片或文件留以供网页/应用直读
func (a *NoteApi) GetFile(c *gin.Context) {
	id := c.Param("id")
	reader, err := global.Storage.Open(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "引擎中不存在此文件"})
		return
	}
	defer reader.Close()

	// 从 FileMetadata 表查询 MIME 类型（新数据）
	// 如果没找到，再从 NoteItem 查询（兼容历史数据）
	contentType := "application/octet-stream"

	var fileMeta models.FileMetadata
	if err := global.DB.Select("mime_type").Where("storage_id = ?", id).First(&fileMeta).Error; err == nil {
		if fileMeta.MimeType != "" {
			contentType = fileMeta.MimeType
		}
	} else {
		// 后备：从 NoteItem 查询（兼容历史数据）
		var note models.NoteItem
		if err := global.DB.Select("file_type").Where("storage_id = ?", id).First(&note).Error; err == nil {
			if note.FileType != "" {
				contentType = note.FileType
			}
		}
	}

	c.Header("Content-Disposition", "inline")
	c.DataFromReader(http.StatusOK, -1, contentType, reader, map[string]string{})
}

// Search 执行混合检索 (Vector + FTS5 + Tag + Link + Recency)
func (a *NoteApi) Search(c *gin.Context) {
	keyword := c.Query("q")
	if keyword == "" {
		// 尝试从 Body 读取 (针对 POST 请求)
		var body struct {
			Query string `json:"query"`
		}
		if err := c.ShouldBindJSON(&body); err == nil && body.Query != "" {
			keyword = body.Query
		}
	}

	if strings.TrimSpace(keyword) == "" {
		// 无参数搜索时，默认返回最近更新的 20 条已分析笔记
		var notes []models.NoteItem
		// 必须 Preload Tags，否则前端 renderTags 会报错或显示无标签
		global.DB.Preload("Tags").Where("status IN ? AND is_archived = ?", []string{"analyzed", "done"}, false).
			Order("updated_at DESC").Limit(20).Find(&notes)

		results := make([]service.SearchResult, 0)
		for _, n := range notes {
			results = append(results, service.SearchResult{
				NoteItem: n,
				Score:    1.0, // 提供基础分值
			})
		}
		c.JSON(http.StatusOK, gin.H{"data": results})
		return
	}

	results, err := service.HybridSearch(keyword, 20)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "检索失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": results})
}

// SoftDelete 逻辑删除（移至回收站）
func (a *NoteApi) SoftDelete(c *gin.Context) {
	id := c.Param("id")
	err := global.DB.Transaction(func(tx *gorm.DB) error {
		// 逻辑删除主记录
		if err := tx.Delete(&models.NoteItem{}, id).Error; err != nil {
			return err
		}
		// 同步删除分片向量索引
		if err := tx.Where("note_id = ?", id).Delete(&models.NoteChunk{}).Error; err != nil {
			return err
		}
		if err := tx.Where("chunk_id IN (SELECT id FROM note_chunks WHERE note_id = ?)", id).Delete(&models.NoteChunkEmbedding{}).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "逻辑删除失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已移至回收站"})
	global.SSEBus.Publish("refresh")
}

// Restore 将被逻辑删除的对象恢复
func (a *NoteApi) Restore(c *gin.Context) {
	id := c.Param("id")
	// GORM 更新 DeletedAt 为 NULL 实现恢复
	if err := global.DB.Unscoped().Model(&models.NoteItem{}).Where("id = ?", id).Update("deleted_at", nil).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "恢复失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已从回收站恢复"})
	global.SSEBus.Publish("refresh")
}

// HardDelete 永久销毁（物理删除数据库记录与存储）
func (a *NoteApi) HardDelete(c *gin.Context) {
	id := c.Param("id")
	err := global.DB.Transaction(func(tx *gorm.DB) error {
		// 1. 物理删除标签关联
		if err := tx.Unscoped().Where("note_id = ?", id).Delete(&models.NoteTag{}).Error; err != nil {
			return err
		}
		// 2. 物理删除分片向量索引
		if err := tx.Unscoped().Where("note_id = ?", id).Delete(&models.NoteChunk{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Exec("DELETE FROM note_chunk_embeddings WHERE chunk_id IN (SELECT id FROM note_chunks WHERE note_id = ?)", id).Error; err != nil {
			return err
		}
		// 3. 物理删除主记录
		if err := tx.Unscoped().Delete(&models.NoteItem{}, id).Error; err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "永久删除失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已永久销毁此记录及关联数据"})
	global.SSEBus.Publish("refresh")
}

// Trash 获取回收站内的逻辑删除记录
func (a *NoteApi) Trash(c *gin.Context) {
	var items []models.NoteItem
	// 使用 Unscoped 可以查询到带有 deleted_at 的记录
	if err := global.DB.Unscoped().Where("deleted_at IS NOT NULL").Order("deleted_at DESC").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取回收站失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

// BatchArchive 批量归档或取消归档
func (a *NoteApi) BatchArchive(c *gin.Context) {
	var body struct {
		IDs     []uint `json:"ids" binding:"required"`
		Archive bool   `json:"archive"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := global.DB.Model(&models.NoteItem{}).
		Where("id IN ?", body.IDs).
		Update("is_archived", body.Archive).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "归档失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "操作成功"})
	global.SSEBus.Publish("refresh")
}

// generateSnippet 在内存中模拟 FTS5 的 snippet 高亮
func generateSnippet(text, keyword string, snippetLen int) string {
	lowerText := strings.ToLower(text)
	lowerKeyword := strings.ToLower(keyword)
	idx := strings.Index(lowerText, lowerKeyword)
	if idx == -1 {
		// 截取前面部分返回
		r := []rune(text)
		if len(r) > snippetLen {
			return string(r[:snippetLen]) + "..."
		}
		return text
	}

	// 找到了，计算 rune 下标以便截取
	textRunes := []rune(text)
	keywordRunes := []rune(keyword)

	// Byte index to Rune index mapping (简单的 O(N) 搜索)
	runeIdx := 0
	for i := range text {
		if i == idx {
			break
		}
		runeIdx++
	}

	start := runeIdx - snippetLen/2
	if start < 0 {
		start = 0
	}
	end := runeIdx + len(keywordRunes) + snippetLen/2
	if end > len(textRunes) {
		end = end - (end - len(textRunes)) // cap at len
		end = len(textRunes)
	}

	res := ""
	if start > 0 {
		res += "..."
	}
	res += string(textRunes[start:runeIdx])
	res += "<b>" + string(textRunes[runeIdx:runeIdx+len(keywordRunes)]) + "</b>"
	res += string(textRunes[runeIdx+len(keywordRunes) : end])
	if end < len(textRunes) {
		res += "..."
	}

	return res
}

// GetTags 获取全部标签（按使用次数降序）
func (a *NoteApi) GetTags(c *gin.Context) {
	type tagCount struct {
		Tag   string `json:"tag"`
		Count int    `json:"count"`
	}
	var tags []tagCount
	err := global.DB.Model(&models.NoteTag{}).
		Select("tag, COUNT(*) as count").
		Group("tag").
		Order("count DESC").
		Scan(&tags).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取标签失败: %v", err)})
		return
	}
	if tags == nil {
		tags = []tagCount{}
	}
	c.JSON(http.StatusOK, gin.H{"data": tags})
}

// Ask 结构体
type AskQuery struct {
	Messages  []map[string]string `json:"messages" binding:"required"`
	SessionID uint                `json:"session_id"`
}

// Ask 是 RAG 核心端点：集成多轮对话 Agent
func (a *NoteApi) Ask(c *gin.Context) {
	var body AskQuery
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误，需要 {messages: []}"})
		return
	}

	if len(body.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "空消息"})
		return
	}

	// 提取最后一条用户消息
	query := ""
	for i := len(body.Messages) - 1; i >= 0; i-- {
		if body.Messages[i]["role"] == "user" {
			query = body.Messages[i]["content"]
			break
		}
	}

	if strings.TrimSpace(query) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未能在上下文中找到用户问题"})
		return
	}

	// 调用多轮对话 Agent
	response, err := service.AgentAsk(body.SessionID, query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Agent 执行失败: " + err.Error()})
		return
	}

	// 转换 references 为前端兼容格式
	var references []models.NoteItem
	for _, ref := range response.References {
		var note models.NoteItem
		if global.DB.First(&note, ref.DocumentID).Error == nil {
			references = append(references, note)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"data":       response.Content,
		"session_id": response.SessionID,
		"references": references,
		"intent":     response.Intent,
		"confidence": response.Confidence,
		"tool_calls": response.ToolCalls,
	})
}

// ListChatSessions 获取历史对话列表
func (a *NoteApi) ListChatSessions(c *gin.Context) {
	var sessions []models.ChatSession
	if err := global.DB.Order("id DESC").Find(&sessions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取历史对话失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": sessions})
}

// GetChatMessages 获取指定会话的所有消息
func (a *NoteApi) GetChatMessages(c *gin.Context) {
	id := c.Param("id")
	var messages []models.ChatMessage
	if err := global.DB.Preload("References").Where("chat_session_id = ?", id).Order("id ASC").Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取会话详情失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": messages})
}

// DeleteChatSession 删除对话会话
func (a *NoteApi) DeleteChatSession(c *gin.Context) {
	id := c.Param("id")

	err := global.DB.Transaction(func(tx *gorm.DB) error {
		// 1. 查找该会话下的所有消息
		var messages []models.ChatMessage
		if err := tx.Where("chat_session_id = ?", id).Find(&messages).Error; err != nil {
			return err
		}

		// 2. 清理消息的多对多引用关系 (chat_message_references)
		for _, msg := range messages {
			if err := tx.Model(&msg).Association("References").Clear(); err != nil {
				return err
			}
		}

		// 3. 删除所有消息
		if err := tx.Where("chat_session_id = ?", id).Delete(&models.ChatMessage{}).Error; err != nil {
			return err
		}

		// 4. 删除会话 (物理删除)
		if err := tx.Unscoped().Delete(&models.ChatSession{}, id).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		fmt.Printf("[DeleteChatSession] Error: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// Serendipity 靈感碰撞接口 (已改造为待处理检阅，支持分页)
func (a *NoteApi) Serendipity(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	var page int
	fmt.Sscanf(pageStr, "%d", &page)

	content, total, references, err := service.GetSerendipityReview(page)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取待处理笔记失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data":       content,
		"total":      total,
		"references": references,
	})
}

// RelatedNotes 获取关联笔记接口
func (a *NoteApi) RelatedNotes(c *gin.Context) {
	idStr := c.Param("id")
	var id uint
	fmt.Sscanf(idStr, "%d", &id)

	items, err := service.GetRelatedNotes(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取关联信息失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": items})
}

// ReprocessNote 手动触发对单条笔记重新提取（使用当前激活的AI模板）
func (a *NoteApi) ReprocessNote(c *gin.Context) {
	id := c.Param("id")

	templateIdStr := c.Query("template_id")
	var templateId uint = 0
	if templateIdStr != "" {
		if idParsed, err := strconv.ParseUint(templateIdStr, 10, 32); err == nil {
			templateId = uint(idParsed)
		}
	}

	err := service.ReprocessNoteWithTemplate(id, templateId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "重新处理失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "已触发后台重新提炼分析"})
}

// GetGraph 获取用于渲染知识图谱的网络节点与边关系数据
func (a *NoteApi) GetGraph(c *gin.Context) {
	data, err := service.GetKnowledgeGraph()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取知识图谱失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

// Synthesize 聚合多个素材为新的知识笔记 (Preview Version)
func (a *NoteApi) Synthesize(c *gin.Context) {
	var body struct {
		IDs    []uint `json:"ids" binding:"required"`
		Prompt string `json:"prompt"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误，需要 ids []uint"})
		return
	}

	title, content, err := service.SynthesizeNotes(body.IDs, body.Prompt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "聚合失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "聚合预览生成成功",
		"data": gin.H{
			"title":   title,
			"content": content,
		},
	})
}

// SaveSynthesized 正式保存聚合后的内容
func (a *NoteApi) SaveSynthesized(c *gin.Context) {
	var body struct {
		IDs     []uint `json:"ids" binding:"required"`
		Title   string `json:"title" binding:"required"`
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数解析失败"})
		return
	}

	note, err := service.CreateSynthesizedNote(body.IDs, body.Title, body.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存聚合笔记失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "聚合合成保存成功",
		"data":    note,
	})
}
// UpdateStatus 修改已有笔记的状态（手动标记已处理等）
func (a *NoteApi) UpdateStatus(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Status      string `json:"status" binding:"required"`
		UserComment string `json:"user_comment"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数解析失败"})
		return
	}

	if err := global.DB.Model(&models.NoteItem{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":       body.Status,
		"user_comment": body.UserComment,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新状态失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "状态更新成功"})
	global.SSEBus.Publish("refresh")
}

// UploadImage 接收图片数据（base64），存储并返回storage_id和URL
func (a *NoteApi) UploadImage(c *gin.Context) {
	var body struct {
		Data     string `json:"data" binding:"required"`      // base64编码的图片数据
		MimeType string `json:"mime_type" binding:"required"` // 图片MIME类型
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误，需要 data 和 mime_type"})
		return
	}

	// 解码base64数据
	imageData, err := base64.StdEncoding.DecodeString(body.Data)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "base64解码失败: " + err.Error()})
		return
	}

	if len(imageData) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "图片数据为空"})
		return
	}

	// 生成唯一storage_id并存储到SnowStorage
	secureName := fmt.Sprintf("img_%d_%s", time.Now().UnixNano(), strings.ReplaceAll(body.MimeType, "/", "_"))
	storageID, err := global.Storage.Save(secureName, bytes.NewReader(imageData))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "存储失败: " + err.Error()})
		return
	}

	// 创建文件元数据记录
	fileMeta := models.FileMetadata{
		StorageID: storageID,
		MimeType:  body.MimeType,
		FileSize:  int64(len(imageData)),
		FileName:  secureName,
	}
	if err := global.DB.Create(&fileMeta).Error; err != nil {
		// 元数据创建失败不影响文件已存储成功，仅记录日志
		fmt.Printf("[UploadImage] 创建文件元数据失败: %v\n", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "图片上传成功",
		"storage_id": storageID,
		"url":        fmt.Sprintf("/api/file/%s", storageID),
	})
}
