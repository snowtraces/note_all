package service

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg"
)

// CreateWikiEntry 创建一条新的 Wiki 词条（人工触发）
func CreateWikiEntry(title, summary, body string, sourceIDs []uint) (*models.WikiEntry, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, fmt.Errorf("词条标题不能为空")
	}

	// 校验来源碎片
	var sources []models.NoteItem
	if len(sourceIDs) > 0 {
		if err := global.DB.Where("id IN ?", sourceIDs).Find(&sources).Error; err != nil {
			return nil, fmt.Errorf("查询来源碎片失败: %v", err)
		}
	}

	entry := models.WikiEntry{
		Title:   title,
		Summary: summary,
		Body:    body,
		Status:  "draft",
		Sources: sources,
	}

	if err := global.DB.Create(&entry).Error; err != nil {
		return nil, fmt.Errorf("创建词条失败: %v", err)
	}

	// 记录初始版本
	saveWikiVersion(entry.ID, body, "初始创建", "user")

	log.Printf("[Wiki] 新词条已创建: #%d 「%s」", entry.ID, entry.Title)
	return &entry, nil
}

// GetWikiEntry 获取词条详情（含来源碎片与关联词条）
func GetWikiEntry(id uint) (*models.WikiEntry, error) {
	var entry models.WikiEntry
	err := global.DB.
		Preload("Sources").
		Preload("LinkedEntries").
		Preload("Tags").
		First(&entry, id).Error
	if err != nil {
		return nil, fmt.Errorf("词条不存在: %v", err)
	}
	return &entry, nil
}

// ListWikiEntries 分页列出词条（按更新时间倒序）
func ListWikiEntries(page, limit int, status string) ([]models.WikiEntry, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	query := global.DB.Model(&models.WikiEntry{})
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var entries []models.WikiEntry
	err := query.Preload("Tags").
		Preload("Sources").
		Order("updated_at DESC").
		Limit(limit).Offset(offset).
		Find(&entries).Error
	return entries, total, err
}

// UpdateWikiEntry 更新词条的核心内容（人工编辑）
func UpdateWikiEntry(id uint, title, summary, body, status string) (*models.WikiEntry, error) {
	var entry models.WikiEntry
	if err := global.DB.First(&entry, id).Error; err != nil {
		return nil, fmt.Errorf("词条不存在")
	}

	oldBody := entry.Body

	ups := map[string]interface{}{}
	if title != "" {
		ups["title"] = strings.TrimSpace(title)
	}
	if summary != "" {
		ups["summary"] = summary
	}
	if body != "" {
		ups["body"] = body
	}
	if status != "" {
		ups["status"] = status
	}
	ups["edit_count"] = entry.EditCount + 1

	if err := global.DB.Model(&entry).Updates(ups).Error; err != nil {
		return nil, fmt.Errorf("更新词条失败: %v", err)
	}

	// 保存历史版本（仅当正文有变化时）
	newBody := body
	if newBody == "" {
		newBody = oldBody
	}
	if newBody != oldBody {
		saveWikiVersion(id, oldBody, "人工编辑", "user")
	}

	// 重新查询带关联的完整对象返回
	return GetWikiEntry(id)
}

// AddWikiSource 为词条追加来源碎片
func AddWikiSource(wikiID, noteID uint) error {
	var entry models.WikiEntry
	if err := global.DB.First(&entry, wikiID).Error; err != nil {
		return fmt.Errorf("词条不存在")
	}
	var note models.NoteItem
	if err := global.DB.First(&note, noteID).Error; err != nil {
		return fmt.Errorf("碎片不存在")
	}
	return global.DB.Model(&entry).Association("Sources").Append(&note)
}

// DeleteWikiEntry 软删除词条
func DeleteWikiEntry(id uint) error {
	return global.DB.Delete(&models.WikiEntry{}, id).Error
}

// GetWikiVersions 获取词条历史版本列表
func GetWikiVersions(wikiID uint) ([]models.WikiVersion, error) {
	var versions []models.WikiVersion
	err := global.DB.Where("wiki_id = ?", wikiID).
		Order("created_at DESC").
		Find(&versions).Error
	return versions, err
}

// ExtractConceptsFromNote 分析碎片内容，提取 1-3 个核心 Wiki 概念
func ExtractConceptsFromNote(note models.NoteItem) ([]string, error) {
	prompt := `你是一个知识图谱专家。请阅读下方的笔记碎片，提取出其中最核心的 1-3 个知识点或百科类词条概念名称。
	
	要求：
	1. 仅输出概念名称，多个概念用英文逗号分隔。
	2. 优先选择专有名词、核心术语或具有百科价值的概念。
	3. 如果内容太散乱无法提取，请输出 "none"。
	
	碎片内容：
	` + note.OcrText

	answer, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": prompt},
	}, "你是一名擅长提炼核心概念的 AI 助手。")
	if err != nil {
		return nil, err
	}

	answer = strings.TrimSpace(answer)
	if strings.ToLower(answer) == "none" || answer == "" {
		return []string{}, nil
	}

	parts := strings.Split(answer, ",")
	var concepts []string
	for _, p := range parts {
		c := strings.TrimSpace(p)
		if c != "" {
			concepts = append(concepts, c)
		}
	}
	return concepts, nil
}

// RefineWikiWithFragment 将新碎片的信息“缝合”进现有的词条中
func RefineWikiWithFragment(entry *models.WikiEntry, fragment models.NoteItem) error {
	prompt := fmt.Sprintf(`你是一名资深的百科编辑。当前正在更新词条「%s」。
	
	【现有词条内容】：
	%s
	
	【新补充的素材碎片】：
	%s
	
	任务：请阅读新素材，将其中的有效新信息、案例或补充细节，有机地融入到现有词条正文中。
	
	要求：
	1. 保持原有的结构化（Markdown）风格。
	2. 仅进行必要的追加或修订，不要删除原有的核心正确信息。
	3. 输出格式需为 JSON：{"summary": "更新后的简短摘要", "body": "更新后的完整 Markdown 正文"}
	4. 如果新素材没有提供任何新信息，请原样返回现有内容库。`, entry.Title, entry.Body, fragment.OcrText)

	answer, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": prompt},
	}, "你是一名擅长专业百科词条修纂的编辑，擅长信息增量合并。")
	if err != nil {
		return err
	}

	var result struct {
		Summary string `json:"summary"`
		Body    string `json:"body"`
	}
	
	start := strings.Index(answer, "{")
	end := strings.LastIndex(answer, "}")
	if start >= 0 && end > start {
		jsonStr := answer[start : end+1]
		if err2 := json.Unmarshal([]byte(jsonStr), &result); err2 == nil && result.Body != "" {
			// 更新数据库
			ups := map[string]interface{}{
				"summary":    result.Summary,
				"body":       result.Body,
				"edit_count": entry.EditCount + 1,
			}
			if err := global.DB.Model(entry).Updates(ups).Error; err != nil {
				return err
			}
			// 记录版本
			saveWikiVersion(entry.ID, result.Body, "AI 自动增量更新: " + fragment.OriginalName, "ai")
			// 关联来源
			global.DB.Model(entry).Association("Sources").Append(&fragment)
			return nil
		}
	}

	return fmt.Errorf("AI 合成输出解析失败")
}

// ProcessNoteForWiki 这是核心调度器：对新入库的碎片进行自动词条化处理
func ProcessNoteForWiki(nID uint) {
	var note models.NoteItem
	if err := global.DB.First(&note, nID).Error; err != nil {
		return
	}

	// 1. 提取概念
	concepts, err := ExtractConceptsFromNote(note)
	if err != nil || len(concepts) == 0 {
		return
	}

	log.Printf("[Wiki 自动提炼] 碎片 ID:%d -> 识别到概念: %v", nID, concepts)

	for _, concept := range concepts {
		// 2. 查找是否有同名（或近义）词条
		var existing models.WikiEntry
		err := global.DB.Where("title = ?", concept).First(&existing).Error
		
		if err == nil {
			// 3.A 命中现有词条 -> 自动修订更新
			log.Printf("[Wiki 自动提炼] 命中心有词条 ID:%d 「%s」，开始增量合并...", existing.ID, concept)
			if err := RefineWikiWithFragment(&existing, note); err != nil {
				log.Printf("[Wiki 异常] 增量合并失败: %v", err)
			}
		} else {
			// 3.B 全新概念 -> 创建新词条 (Draft)
			log.Printf("[Wiki 自动提炼] 发现新概念 「%s」，开始初始化词条...", concept)
			_, err := AutoCreateWikiFromFragments(concept, []uint{nID})
			if err != nil {
				log.Printf("[Wiki 异常] 自动创建词条失败: %v", err)
			}
		}
	}
}

// synthesizeWikiContent 调用 AI 合成词条正文
func synthesizeWikiContent(title string, sources []models.NoteItem) (summary, body string, err error) {
	var ctx strings.Builder
	for i, s := range sources {
		text := s.OcrText
		if len([]rune(text)) > 8000 {
			text = string([]rune(text)[:8000]) + "..."
		}
		ctx.WriteString(fmt.Sprintf("来源 %d（标题：%s）:\n%s\n\n", i+1, s.OriginalName, text))
	}

	systemPrompt := `你是一名专业的知识库编辑，擅长将多篇原始资料整合为清晰、结构良好的 Wikipedia 风格词条文章。

任务：根据下方提供的来源素材，为概念「` + title + `」编写词条。

输出要求：
1. 严格以 JSON 格式输出，格式：{"summary": "一句话摘要（50字以内）", "body": "完整 Markdown 正文"}
2. Markdown 正文需包含：背景与定义、核心特征/属性、相关案例或应用
3. 可适当使用 [[双向链接]] 语法引用相关概念
4. 不得捏造来源素材中未提及的信息`

	log.Printf("[Wiki Synthesis] Calling AI for concept: %s with %d sources", title, len(sources))
	answer, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": "来源素材：\n\n" + ctx.String()},
	}, systemPrompt)
	if err != nil {
		log.Printf("[Wiki Synthesis] AI Call Error: %v", err)
		return "", "", err
	}

	log.Printf("[Wiki Synthesis] Raw AI Response for %s: %s", title, answer)

	var result struct {
		Summary string `json:"summary"`
		Body    string `json:"body"`
	}
	start := strings.Index(answer, "{")
	end := strings.LastIndex(answer, "}")
	if start >= 0 && end > start {
		jsonStr := answer[start : end+1]
		if err2 := json.Unmarshal([]byte(jsonStr), &result); err2 == nil && result.Body != "" {
			log.Printf("[Wiki Synthesis] Success parsing JSON for %s", title)
			return result.Summary, result.Body, nil
		} else {
			log.Printf("[Wiki Synthesis] JSON Unmarshal Error for %s: %v", title, err2)
		}
	}
	log.Printf("[Wiki Synthesis] Degraded to raw text for %s", title)
	return title + " 综合摘要", answer, nil
}

// AutoCreateWikiFromFragments 从给定的碎片集合中自动提炼并创建词条
func AutoCreateWikiFromFragments(title string, sourceIDs []uint) (*models.WikiEntry, error) {
	log.Printf("[Wiki Auto] Starting AutoCreate for %s (IDs: %v)", title, sourceIDs)
	var sources []models.NoteItem
	if err := global.DB.Where("id IN ?", sourceIDs).Find(&sources).Error; err != nil {
		log.Printf("[Wiki Auto] DB Find Error: %v", err)
		return nil, err
	}
	if len(sources) == 0 {
		return nil, fmt.Errorf("来源碎片为空")
	}

	summary, body, err := synthesizeWikiContent(title, sources)
	if err != nil {
		log.Printf("[Wiki Auto] Synthesis Error: %v", err)
		return nil, err
	}

	now := time.Now()
	entry := models.WikiEntry{
		Title:        title,
		Summary:      summary,
		Body:         body,
		Status:       "draft",
		Sources:      sources,
		LastAiEditAt: &now,
		EditCount:    1,
	}

	if err := global.DB.Create(&entry).Error; err != nil {
		log.Printf("[Wiki Auto] DB Create Error: %v", err)
		return nil, err
	}
	saveWikiVersion(entry.ID, body, "AI 自动生成", "ai")
	log.Printf("[Wiki Auto] Successfully Created Wiki Entry #%d: %s", entry.ID, title)
	return &entry, nil
}

// saveWikiVersion 内部辅助：保存一条版本快照
func saveWikiVersion(wikiID uint, body, editSummary, editedBy string) {
	v := models.WikiVersion{
		WikiID:       wikiID,
		BodySnapshot: body,
		EditSummary:  editSummary,
		EditedBy:     editedBy,
	}
	if err := global.DB.Create(&v).Error; err != nil {
		log.Printf("[Wiki] 保存历史版本失败 (wiki_id:%d): %v", wikiID, err)
	}
}
