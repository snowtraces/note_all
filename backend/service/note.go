package service

import (
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg"
	"note_all_backend/pkg/processor"

	"gorm.io/gorm/clause"
)

// syncTags 将逗号分隔的标签字符串同步写入 note_tags 关联表（先清后写）
func syncTags(nID uint, tags string) {
	global.DB.Where("note_id = ?", nID).Delete(&models.NoteTag{})
	if tags == "" || tags == "ai-fail" {
		return
	}
	var tagRecords []models.NoteTag
	for _, t := range strings.Split(tags, ",") {
		t = strings.TrimSpace(t)
		if t != "" {
			tagRecords = append(tagRecords, models.NoteTag{NoteID: nID, Tag: t})
		}
	}
	if len(tagRecords) > 0 {
		global.DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&tagRecords)
	}
}

// UploadAndCreateNote 处理复杂的文件落盘与 DB 生成主线逻辑
func UploadAndCreateNote(file *multipart.FileHeader) (*models.NoteItem, error) {
	// 1. 读取 HTTP 表单文件的原始流
	f, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("无法读取原始文件流: %v", err)
	}
	defer f.Close()

	// 2. 存入底层块系统 (snow_storage)，这里要用带时间戳的名称作防重击穿处理，以获取真正的 UUID/UniqueID (即 storageID)
	secureName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), file.Filename)
	storageID, err := global.Storage.Save(secureName, f)
	if err != nil {
		return nil, fmt.Errorf("底层存储失败: %v", err)
	}

	// 3. 构建 DB 数据实体 (目前状态为 pending)
	note := models.NoteItem{
		OriginalName: file.Filename,
		StorageID:    storageID,
		FileType:     file.Header.Get("Content-Type"),
		FileSize:     file.Size,
		Status:       "pending",
	}

	// 4. 落库
	if err := global.DB.Create(&note).Error; err != nil {
		return nil, fmt.Errorf("数据库元数据建立失败: %v", err)
	}

	// 5. 将任务发送到后台队列进行阻塞排队处理，避免并发过高触发 OCR/LLM 接口限流 (429)
	nID := note.ID
	sID := note.StorageID
	originalName := note.OriginalName

	global.WorkerChan <- func() {
		log.Printf("[后台作业] 开始为数据包 (ID:%d) 唤起 OCR 识别...\n", nID)

		// 5.1 从存储里扒出二进制字节，供 paddle API 发送
		fileReader, err := global.Storage.Open(sID)
		if err != nil {
			log.Printf("[OCR 异常] 无法触达存储获取源文件: %v", err)
			return
		}

		fileBlob, err := io.ReadAll(fileReader)
		if err != nil {
			fileReader.Close()
			log.Printf("[OCR 异常] 文件分块读取碎片异常: %v", err)
			return
		}
		fileReader.Close()

		// 5.2 发送 Base64 提取 OCR 及排版信息
		ext := filepath.Ext(originalName)
		markdownText, err := pkg.ExtractTextFromImage(fileBlob, ext)

		if err != nil {
			log.Printf("[OCR 解析失败] 记录ID %d: %v", nID, err)
			global.DB.Model(&models.NoteItem{}).Where("id = ?", nID).Update("status", "error")
			return
		}

		validText := strings.TrimSpace(markdownText)

		// 5.2.5 [新功能优化] 图片尝试OCR，如果未返回实质内容再进行多模态理解（VLM 兜底）
		vlmTriggered := false
		vlmSummary := ""
		vlmTags := ""
		vlmDescription := ""

		if strings.HasPrefix(note.FileType, "image/") && validText == "" {
			desc, summaryStr, tagsStr, vlmErr := pkg.DescribeImageVlm(fileBlob, note.FileType)
			if vlmErr == nil && desc != "" {
				vlmDescription = desc
				vlmSummary = summaryStr
				vlmTags = tagsStr
				vlmTriggered = true
				log.Printf("[OCR内容为空] 触发VLM识别兜底成功, 记录ID %d: 图片视觉描述、摘要及标签已同步生成", nID)
			} else {
				log.Printf("[VLM 识别失败] 记录ID %d: %v", nID, vlmErr)
			}
		}

		// 5.3 唤起大模型进行“提炼归纳”与“提取标签”
		summary := ""
		tags := ""

		if vlmTriggered {
			// 直接使用 VLM 一并生成的描述、摘要和标签，免去二次调用 LLM
			markdownText = vlmDescription
			summary = vlmSummary
			tags = vlmTags
		} else {
			activeTpl, _ := models.GetActiveTemplate(global.DB)
			llmInput := markdownText
			summaryStr, tagsStr, err := pkg.ExtractSummaryAndTags(llmInput, activeTpl.SystemPrompt)
			if err != nil {
				log.Printf("[大模型提炼失败降级] 记录ID %d: %v", nID, err)
				summary = llmInput // 原文兜底
				tags = "ai-fail"
			} else {
				summary = summaryStr
				tags = tagsStr
			}
		}

		// 5.4 数据最终态更新
		global.DB.Model(&models.NoteItem{}).Where("id = ?", nID).Updates(map[string]interface{}{
			"ocr_text":   markdownText,
			"ai_summary": summary,
			"ai_tags":    tags,
			"status":     "analyzed",
		})

		// 5.5 同步写入标签关联表
		syncTags(nID, tags)

		log.Printf("[后台作业总链完成] 记录ID %d: PaddleOCR 与 文心大模型 融合全链路结束！提取精简摘要 [%s]...", nID, summary)
	}

	return &note, nil
}

// CreateNoteFromText 直接以纯文本创建笔记，跳过 OCR，直接调用 LLM 提炼摘要与标签
// 如果传入的是单纯的可达 URL 链接，系统会自动尝试抓取正文并解析为 Markdown。
func CreateNoteFromText(text string) (*models.NoteItem, error) {
	text = strings.TrimSpace(text)

	originalName := ""
	isURLFetch := false
	originalUrl := ""
	pureContentLen := 0
	if processor.IsURL(text) {
		title, markdown, cLen, err := processor.FetchURLContent(text)
		if err == nil {
			originalName = title
			originalUrl = text
			text = markdown
			pureContentLen = cLen
			isURLFetch = true
		} else {
			log.Printf("[URL解析告警] %s 提取失败，降级保存纯文本: %v", text, err)
		}
	}

	if originalName == "" {
		runes := []rune(text)
		name := string(runes)
		if len(runes) > 30 {
			name = string(runes[:30]) + "..."
		}
		if name == "" {
			name = "文本录入"
		}
		originalName = name
	}

	storageID := fmt.Sprintf("text_%d", time.Now().UnixNano())

	note := models.NoteItem{
		OriginalName: originalName,
		StorageID:    storageID,
		FileType:     "text/plain",
		FileSize:     int64(len(text)),
		OriginalUrl:  originalUrl,
		Status:       "pending",
	}

	if isURLFetch {
		note.FileType = "text/markdown"
	}

	if err := global.DB.Create(&note).Error; err != nil {
		return nil, fmt.Errorf("数据库元数据建立失败: %v", err)
	}

	nID := note.ID
	rawText := text
	isUrl := isURLFetch
	pureLen := pureContentLen
	rawUrl := originalUrl

	global.WorkerChan <- func() {
		prefix := "[文本录入作业]"
		if isUrl {
			prefix = "[URL剪藏作业]"
		}
		log.Printf("%s 开始为数据包 (ID:%d) 唤起 LLM 提炼...\n", prefix, nID)

		if isUrl && pureLen < 64 {
			log.Printf("%s 记录ID %d: 正文内容极少(%d)，跳过大模型，固定标签记录\n", prefix, nID, pureLen)

			u, err := url.Parse(rawUrl)
			domain := "未知域名"
			businessKey := "未知主键"
			if err == nil && u.Host != "" {
				domain = u.Host
				businessKey = u.Path
				if businessKey == "" {
					businessKey = "/"
				}
			}

			summary := "该网页提取到的核心正文过少，可能为图片/视频站点、单页应用或遭到了防火墙拦截。建议直接点击上方标题链接在浏览器中直达阅览。"
			tags := fmt.Sprintf("URL地址,%s,%s", domain, businessKey)

			global.DB.Model(&models.NoteItem{}).Where("id = ?", nID).Updates(map[string]interface{}{
				"ocr_text":   rawText,
				"ai_summary": summary,
				"ai_tags":    tags,
				"status":     "analyzed",
			})
			syncTags(nID, tags)
			return
		}

		// 为防止长网页超过大模型上限，截取前面部分给大模型看（只影响标签与摘要提炼）
		llmInput := rawText
		if isUrl && len([]rune(llmInput)) > 10000 {
			llmInput = string([]rune(llmInput)[:10000]) + "..."
		}

		activeTpl, _ := models.GetActiveTemplate(global.DB)
		summary, tags, err := pkg.ExtractSummaryAndTags(llmInput, activeTpl.SystemPrompt)
		if err != nil {
			log.Printf("[大模型提炼失败降级] 记录ID %d: %v", nID, err)
			summary = llmInput
			// 降级截断，避免 UI 把大长篇内容塞到列表 item 卡片上
			if len([]rune(summary)) > 60 {
				summary = string([]rune(summary)[:60]) + "..."
			}
			tags = "ai-fail"
		}

		global.DB.Model(&models.NoteItem{}).Where("id = ?", nID).Updates(map[string]interface{}{
			"ocr_text":   rawText, // DB 存入必须是原封不动的完整抓取全本与图片占位，便于 RAG
			"ai_summary": summary,
			"ai_tags":    tags,
			"status":     "analyzed",
		})

		syncTags(nID, tags)

		log.Printf("%s 记录ID %d: 提取精简摘要 [%s]...", prefix, nID, summary)
	}

	return &note, nil
}

// UpdateNoteText 更新已有碎片的 OCR 文本，并触发后台重新提炼 LLM 摘要和标签任务
func UpdateNoteText(id string, text string) error {
	// 先更新原文，避免页面刷新还能看到老数据，标记为状态分析中
	if err := global.DB.Model(&models.NoteItem{}).Where("id = ?", id).Updates(map[string]interface{}{
		"ocr_text": text,
		"status":   "pending",
	}).Error; err != nil {
		return fmt.Errorf("原文写入失败: %v", err)
	}

	// 开户后段协程跑昂贵的 LLM API 更新逻辑
	itemID := id
	rawText := text

	global.WorkerChan <- func() {
		log.Printf("[重新提炼作业] 开始为数据包 (ID:%s) 唤起 LLM 更新提炼...\n", itemID)

		activeTpl, _ := models.GetActiveTemplate(global.DB)
		summary, tags, err := pkg.ExtractSummaryAndTags(rawText, activeTpl.SystemPrompt)
		if err != nil {
			log.Printf("[重新提炼大模型失败降级] 记录ID %s: %v", itemID, err)
			summary = rawText
			tags = "ai-fail"
		}

		global.DB.Model(&models.NoteItem{}).Where("id = ?", itemID).Updates(map[string]interface{}{
			"ai_summary": summary,
			"ai_tags":    tags,
			"status":     "analyzed",
		})

		// 需要先把 string 类型的 itemID 转换为 uint 用于 tag 同步
		var noteItem models.NoteItem
		if err := global.DB.Select("id").Where("id = ?", itemID).First(&noteItem).Error; err == nil {
			syncTags(noteItem.ID, tags)
		}

		log.Printf("[重新提炼作业完成] 记录ID %s: 提取新精简摘要 [%s]...", itemID, summary)
	}

	return nil
}

// GetSerendipityReview 随机抽取若干碎片进行灵感碰撞
func GetSerendipityReview() (string, []models.NoteItem, error) {
	var items []models.NoteItem
	// SQLite 特有的随机排序写法: ORDER BY RANDOM()
	err := global.DB.Where("status = ?", "analyzed").Order("RANDOM()").Limit(3).Find(&items).Error
	if err != nil {
		return "", nil, err
	}

	if len(items) < 2 {
		return "库中笔记碎片太少（需至少 2 条已分析完成的碎片），暂时无法开启灵感碰撞。快去多录入一些信息并静待 AI 分析吧！", items, nil
	}

	// 组装 Context
	var context strings.Builder
	for i, item := range items {
		context.WriteString(fmt.Sprintf("%d. 【%s】: %s\n", i+1, item.OriginalName, item.AiSummary))
	}

	prompt := "你是一个知识连接助理（灵感激发器）。以下是用户数据库中随机抽取的 3 条碎片概括：\n\n" +
		context.String() + "\n" +
		"请你做两件事：\n" +
		"1. 撰写一段富有哲理性或灵感启发性的短文（约 80 字），将这三者以某种意想不到的角度串联在一起，帮用户开启思维火花。\n" +
		"2. 别太啰嗦，直接进入正题。\n\n" +
		"请用温暖、理性的语感创作。"

	// 调用大模型 (复用 AskAI 核心逻辑，传空消息数组表明只传 System/User 复合 Prompt)
	answer, err := pkg.AskAIWithContext([]map[string]string{
		{"role": "user", "content": prompt},
	}, "")
	if err != nil {
		return "", items, err
	}

	return answer, items, nil
}

// GetRelatedNotes 根据当前笔记的标签，自动寻找相似的关联笔记
func GetRelatedNotes(id uint) ([]models.NoteItem, error) {
	var currentNote models.NoteItem
	if err := global.DB.Preload("Tags").First(&currentNote, id).Error; err != nil {
		return nil, err
	}

	if len(currentNote.Tags) == 0 {
		return []models.NoteItem{}, nil
	}

	// 提取当前笔记的所有标签
	tagNames := make([]string, len(currentNote.Tags))
	for i, t := range currentNote.Tags {
		tagNames[i] = t.Tag
	}

	var relatedItems []models.NoteItem
	// 查询拥有相同标签的其他笔记（去重并在数据库层完成）
	err := global.DB.Table("note_items").
		Joins("JOIN note_tags ON note_tags.note_id = note_items.id").
		Where("note_tags.tag IN ? AND note_items.id <> ?", tagNames, id).
		Where("note_items.deleted_at IS NULL").
		Group("note_items.id").
		Order("COUNT(note_tags.tag) DESC, note_items.id DESC").
		Limit(5).
		Find(&relatedItems).Error

	if err != nil {
		return nil, err
	}

	return relatedItems, nil
}

// ReprocessNoteWithTemplate 强制重新对给定的笔记ID执行AI处理（使用当前指定模板，如果如果未指定则使用激活模板）
func ReprocessNoteWithTemplate(id string, templateId uint) error {
	var note models.NoteItem
	if err := global.DB.First(&note, id).Error; err != nil {
		return err
	}

	// 先将状态标记为分析中
	if err := global.DB.Model(&models.NoteItem{}).Where("id = ?", id).Update("status", "pending").Error; err != nil {
		return err
	}

	global.WorkerChan <- func() {
		log.Printf("[手动使用模板重新提炼] 开始处理记录 (ID:%d)...\n", note.ID)

		var targetTpl models.PromptTemplate
		if templateId > 0 {
			global.DB.First(&targetTpl, templateId)
		} else {
			targetTpl, _ = models.GetActiveTemplate(global.DB)
		}

		rawText := note.OcrText

		// 调用大模型
		summary, tags, err := pkg.ExtractSummaryAndTags(rawText, targetTpl.SystemPrompt)
		if err != nil {
			log.Printf("[手动重新提炼失败] 记录ID %d: %v", note.ID, err)
			summary = rawText
			tags = "ai-fail"
		}

		// 更新记录
		global.DB.Model(&models.NoteItem{}).Where("id = ?", note.ID).Updates(map[string]interface{}{
			"ai_summary": summary,
			"ai_tags":    tags,
			"status":     "analyzed",
		})

		// 同步更新关联标签
		syncTags(note.ID, tags)

		log.Printf("[手动重新提炼完成] 记录ID %d, 使用模板: %s", note.ID, targetTpl.Name)
	}

	return nil
}

// GetKnowledgeGraph 吐出用于 react-force-graph-2d 渲染所需的 nodes 和 links
func GetKnowledgeGraph() (map[string]interface{}, error) {
	// 1. 获取所有存在且有效的 tags (属于未被逻辑删除且已解析的笔记)，以建立 Tag 节点
	type tagCount struct {
		Tag   string
		Count int
	}
	var tags []tagCount
	// 修改：增加 JOIN note_items 并过滤删除状态，确保只有关联了有效笔记的标签才会出现在图谱中
	if err := global.DB.Table("note_tags").
		Select("note_tags.tag, COUNT(note_tags.tag) as count").
		Joins("JOIN note_items ON note_items.id = note_tags.note_id").
		Where("note_items.deleted_at IS NULL AND note_items.status = ?", "analyzed").
		Group("note_tags.tag").
		Having("count > 0").
		Scan(&tags).Error; err != nil {
		return nil, err
	}

	// 2. 查出所有拥有标签的已解析 Note (去除了软删除的) 准备出 Note 节点
	var notes []models.NoteItem
	if err := global.DB.
		Where("status = ?", "analyzed").
		Where("ai_tags IS NOT NULL AND ai_tags != '' AND ai_tags != 'ai-fail'").
		Find(&notes).Error; err != nil {
		return nil, err
	}

	// 3. 构建结果集
	nodes := make([]map[string]interface{}, 0)
	links := make([]map[string]interface{}, 0)

	// 去重 Tag Node 并加入 Nodes 列表
	tagMap := make(map[string]bool)
	for _, t := range tags {
		if !tagMap[t.Tag] {
			nodes = append(nodes, map[string]interface{}{
				"id":    "tag_" + t.Tag,
				"name":  t.Tag,
				"type":  "tag",
				"count": t.Count,
			})
			tagMap[t.Tag] = true
		}
	}

	// 加入 Note Nodes 并根据逗号分隔的 Tag 构建 Links
	for _, note := range notes {
		nodeId := fmt.Sprintf("note_%d", note.ID)
		nodes = append(nodes, map[string]interface{}{
			"id":      nodeId,
			"name":    note.OriginalName,
			"type":    "note",
			"note_id": note.ID,
			"summary": note.AiSummary, // 给 Hover 用
			"file_id": note.StorageID, // 给 Hover 图片用
			"mime":    note.FileType,
		})

		noteKeys := strings.Split(note.AiTags, ",")
		for _, tk := range noteKeys {
			tk = strings.TrimSpace(tk)
			if tk != "" && tagMap[tk] {
				links = append(links, map[string]interface{}{
					"source": nodeId,
					"target": "tag_" + tk,
					"value":  1,
				})
			}
		}
	}

	return map[string]interface{}{
		"nodes": nodes,
		"links": links,
	}, nil
}
