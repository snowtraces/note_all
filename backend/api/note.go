package api

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg"
	"note_all_backend/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type NoteApi struct{}

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

	// 从 DB 查询该文件存储时记录的真实 MIME 类型
	var note models.NoteItem
	contentType := "application/octet-stream"
	if err := global.DB.Select("file_type").Where("storage_id = ?", id).First(&note).Error; err == nil {
		if note.FileType != "" {
			contentType = note.FileType
		}
	}

	c.Header("Content-Disposition", "inline")
	c.DataFromReader(http.StatusOK, -1, contentType, reader, map[string]string{})
}

// Search 执行跨 FTS5 内外联接的高性能文本检索并含 snippet 摘要匹配
func (a *NoteApi) Search(c *gin.Context) {
	keyword := c.Query("q")

	type searchResult struct {
		models.NoteItem
		Snippet string `json:"snippet"`
	}

	// ===== # 标签精确模式 =====
	if strings.HasPrefix(keyword, "#") {
		tagName := strings.TrimSpace(keyword[1:])
		var items []models.NoteItem
		err := global.DB.Joins("JOIN note_tags ON note_tags.note_id = note_items.id").
			Where("note_tags.tag = ?", tagName).
			Order("note_items.id DESC").
			Limit(50).
			Find(&items).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("标签搜索失败: %v", err)})
			return
		}
		results := make([]searchResult, len(items))
		for i, item := range items {
			results[i] = searchResult{NoteItem: item, Snippet: ""}
		}
		c.JSON(http.StatusOK, gin.H{"data": results})
		return
	}

	safeKeyword := strings.ReplaceAll(keyword, "\"", "")
	safeKeyword = strings.ReplaceAll(safeKeyword, "'", "")
	if strings.TrimSpace(safeKeyword) == "" {
		var items []models.NoteItem
		// 默认拉取最新创建的数据
		if err := global.DB.Order("id DESC").Limit(30).Find(&items).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "获取默认列表失败"})
			return
		}

		results := make([]searchResult, len(items))
		for i, item := range items {
			results[i] = searchResult{NoteItem: item, Snippet: ""}
		}
		c.JSON(http.StatusOK, gin.H{"data": results})
		return
	}

	// 检查是否包含长度<3的词（尤其是对于中文2字词或者单字），
	// glebarez/sqlite 的 FTS5 trigram tokenizer 无法直接 MATCH <3 个字符的词。
	words := strings.Fields(safeKeyword)
	needsFallback := false
	for _, w := range words {
		if len([]rune(w)) < 3 {
			needsFallback = true
			break
		}
	}

	if needsFallback {
		// 降级使用 LIKE 查询，解决短字符（包含绝大数中文词语）搜不到的问题
		dbQuery := global.DB.Model(&models.NoteItem{})
		for _, w := range words {
			likeStr := "%" + w + "%"
			dbQuery = dbQuery.Where("ocr_text LIKE ? OR original_name LIKE ? OR ai_summary LIKE ? OR ai_tags LIKE ?", likeStr, likeStr, likeStr, likeStr)
		}
		var items []models.NoteItem
		if err := dbQuery.Order("id DESC").Limit(50).Find(&items).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取笔记详情失败: %v", err)})
			return
		}

		results := make([]searchResult, len(items))
		for i, item := range items {
			snippetText := ""
			if len(words) > 0 {
				snippetText = generateSnippet(item.OcrText, words[0], 64)
				if snippetText == "" {
					snippetText = generateSnippet(item.OriginalName, words[0], 64)
				}
			}
			results[i] = searchResult{NoteItem: item, Snippet: snippetText}
		}
		c.JSON(http.StatusOK, gin.H{"data": results})
		return
	}

	// 对于全都是长度>=3的词，使用高性能的 FTS5 全文索引
	// glebarez/sqlite (modernc.org/sqlite) 的 FTS5 在非 main goroutine 里有 SQLITE_MISUSE 限制：
	// GORM 的 Scan/ColumnTypes() 会触发 Error 21。
	// 根治方案：完全绕开 GORM，用底层 database/sql QueryContext + rows.Scan() 操作 FTS5。
	sqlDB, err := global.DB.DB()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取DB连接失败"})
		return
	}

	// keyword 已脱敏，并且外层双引号强制匹配完整词组，如果想切分词汇其实交给 FTS5 也能处理，但此处为安全起见用字面量
	ftsSQL := fmt.Sprintf(`
	SELECT rowid, snippet(note_fts, -1, '<b>', '</b>', '...', 64)
	FROM note_fts
	WHERE note_fts MATCH '"%s"'
	ORDER BY rowid DESC LIMIT 50;`, safeKeyword)

	rows, err := sqlDB.QueryContext(c.Request.Context(), ftsSQL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("全文检索失败: %v", err)})
		return
	}
	defer rows.Close()

	type ftsHit struct {
		Rowid   int64
		Snippet string
	}
	var hits []ftsHit
	for rows.Next() {
		var h ftsHit
		if e := rows.Scan(&h.Rowid, &h.Snippet); e != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("读取搜索结果失败: %v", e)})
			return
		}
		hits = append(hits, h)
	}
	if err = rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("遍历搜索结果失败: %v", err)})
		return
	}

	if len(hits) == 0 {
		c.JSON(http.StatusOK, gin.H{"data": []searchResult{}})
		return
	}

	// Step 2: 用 GORM 标准查询获取 note_items 详情（普通表，无 FTS5）
	ids := make([]int64, 0, len(hits))
	snippetMap := make(map[uint]string, len(hits))
	idxMap := make(map[uint]int, len(hits))
	for i, h := range hits {
		ids = append(ids, h.Rowid)
		snippetMap[uint(h.Rowid)] = h.Snippet
		idxMap[uint(h.Rowid)] = i
	}
	var items []models.NoteItem
	if err = global.DB.Where("id IN ?", ids).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取笔记详情失败: %v", err)})
		return
	}

	// Step 3: Go 层合并，保持 FTS5 rank 排名顺序
	results := make([]searchResult, len(items))
	for i, item := range items {
		results[i] = searchResult{NoteItem: item, Snippet: snippetMap[item.ID]}
	}
	sort.Slice(results, func(i, j int) bool {
		return idxMap[results[i].ID] < idxMap[results[j].ID]
	})

	c.JSON(http.StatusOK, gin.H{"data": results})
}

// SoftDelete 逻辑删除（移至回收站）
func (a *NoteApi) SoftDelete(c *gin.Context) {
	id := c.Param("id")
	if err := global.DB.Delete(&models.NoteItem{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "逻辑删除失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已移至回收站"})
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
}

// HardDelete 永久销毁（物理删除数据库记录与存储，这里演示简单物理删数据库即可触发关联）
func (a *NoteApi) HardDelete(c *gin.Context) {
	id := c.Param("id")
	if err := global.DB.Unscoped().Delete(&models.NoteItem{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "永久删除失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已永久销毁此记录"})
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

// Ask 是一个 RAG 端点：基于 FTS5 搜索当前问题，并联合上下文和多轮历史给 LLM
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

	// 找出最后一条 User 的话语提取关键词
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

	safeKeyword := strings.ReplaceAll(query, "\"", "")
	safeKeyword = strings.ReplaceAll(safeKeyword, "'", "")

	var items []models.NoteItem

	words := strings.Fields(safeKeyword)
	needsFallback := false
	for _, w := range words {
		if len([]rune(w)) < 3 {
			needsFallback = true
			break
		}
	}

	if needsFallback {
		dbQuery := global.DB.Model(&models.NoteItem{})
		for _, w := range words {
			likeStr := "%" + w + "%"
			dbQuery = dbQuery.Where("ocr_text LIKE ? OR original_name LIKE ? OR ai_summary LIKE ? OR ai_tags LIKE ?", likeStr, likeStr, likeStr, likeStr)
		}
		if err := dbQuery.Order("id DESC").Limit(8).Find(&items).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取关联笔记失败: %v", err)})
			return
		}
		fmt.Printf("[Ask] Fallback LIKE found: %d\n", len(items))
	} else {
		sqlDB, err := global.DB.DB()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "获取DB连接失败"})
			return
		}

		ftsSQL := fmt.Sprintf(`
		SELECT rowid 
		FROM note_fts 
		WHERE note_fts MATCH '"%s"' 
		ORDER BY rank LIMIT 8;`, safeKeyword)

		rows, err := sqlDB.QueryContext(c.Request.Context(), ftsSQL)
		if err == nil {
			var ids []int64
			for rows.Next() {
				var id int64
				if rows.Scan(&id) == nil {
					ids = append(ids, id)
				}
			}
			rows.Close()
			if len(ids) > 0 {
				global.DB.Where("id IN ?", ids).Find(&items)
				fmt.Printf("[Ask] FTS found: %d\n", len(items))
			}
		}

		// 如果 FTS 一个都没找到，可能因为分词问题，降级一次 LIKE
		if len(items) == 0 {
			dbQuery := global.DB.Model(&models.NoteItem{})
			for _, w := range words {
				likeStr := "%" + w + "%"
				dbQuery = dbQuery.Where("ocr_text LIKE ? OR original_name LIKE ? OR ai_summary LIKE ? OR ai_tags LIKE ?", likeStr, likeStr, likeStr, likeStr)
			}
			dbQuery.Order("id DESC").Limit(5).Find(&items)
			fmt.Printf("[Ask] FTS missed, second LIKE-fallback found: %d\n", len(items))
		}
	}

	// 组装 Context
	contextBuilder := strings.Builder{}
	for _, item := range items {
		// 不要塞入整个 ocr_text 如果太长的话，不过一般碎片知识可以塞入。为防止超 Token，这里可以截断 OCR 原文，或者只依赖 AiSummary。
		text := item.OcrText
		if len([]rune(text)) > 500 {
			text = string([]rune(text)[:500]) + "..."
		}
		contextBuilder.WriteString(fmt.Sprintf("- 笔记名称：%s\n  标签：%s\n  AI摘要：%s\n  内容详情：%s\n\n", item.OriginalName, item.AiTags, item.AiSummary, text))
	}

	// 调用大模型 (传入多轮消息数组)
	answer, err := pkg.AskAIWithContext(body.Messages, contextBuilder.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("AI思考失败: %v", err)})
		return
	}

	// 持久化存储
	sessionID := body.SessionID
	if sessionID == 0 {
		session := models.ChatSession{Title: query}
		if len([]rune(session.Title)) > 30 {
			session.Title = string([]rune(session.Title)[:30]) + "..."
		}
		global.DB.Create(&session)
		sessionID = session.ID
	}

	// 记录本次交互
	global.DB.Create(&models.ChatMessage{
		ChatSessionID: sessionID,
		Role:          "user",
		Content:       query,
	})
	global.DB.Create(&models.ChatMessage{
		ChatSessionID: sessionID,
		Role:          "assistant",
		Content:       answer,
		References:    items,
	})

	c.JSON(http.StatusOK, gin.H{
		"data":       answer,
		"session_id": sessionID,
		"references": items,
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

// Serendipity 靈感碰撞接口
func (a *NoteApi) Serendipity(c *gin.Context) {
	content, references, err := service.GetSerendipityReview()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取灵感失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data":       content,
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

