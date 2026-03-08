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

	// 5. 启动一个 Goroutine 后台开启 Paddle OCR 文本解析任务
	go func(nID uint, sID string, originalName string) {
		log.Printf("[后台作业] 开始为数据包 (ID:%d) 唤起 OCR 识别...\n", nID)

		// 5.1 从存储里扒出二进制字节，供 paddle API 发送
		fileReader, err := global.Storage.Open(sID)
		if err != nil {
			log.Printf("[OCR 异场] 无法触达存储获取源文件: %v", err)
			return
		}

		fileBlob, err := io.ReadAll(fileReader)
		if err != nil {
			fileReader.Close()
			log.Printf("[OCR 异场] 文件分块读取碎片异常: %v", err)
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

		// 5.3 唤起百度千帆 AI（文心大模型 ERNIE）进行“提炼归纳”与“提取标签”
		summary, tags, err := pkg.ExtractSummaryAndTags(markdownText)
		if err != nil {
			log.Printf("[大模型提炼失败降级] 记录ID %d: %v", nID, err)
			// 模型调用不顺畅时不应阻塞整交流，降级退守 ocred 原文本记录
			summary = markdownText // 原文兜底
			tags = "ai-fail"
		}

		// 5.4 数据最终态更新（将 OCR / 摘要 / 标签直接送入 DB 将触发 SQLite Trigger 同步推入全文 FTS5 虚拟表！）
		global.DB.Model(&models.NoteItem{}).Where("id = ?", nID).Updates(map[string]interface{}{
			"ocr_text":   markdownText,
			"ai_summary": summary,
			"ai_tags":    tags,
			"status":     "analyzed",
		})

		// 5.5 同步写入标签关联表
		syncTags(nID, tags)

		log.Printf("[后台作业总链完成] 记录ID %d: PaddleOCR 与 文心大模型 融合全链路结束！提取精简摘要 [%s]...", nID, summary)

	}(note.ID, note.StorageID, note.OriginalName)

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

	go func(nID uint, rawText string, isUrl bool, pureLen int, rawUrl string) {
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

		summary, tags, err := pkg.ExtractSummaryAndTags(llmInput)
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
	}(note.ID, text, isURLFetch, pureContentLen, originalUrl)

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
	go func(itemID string, rawText string) {
		log.Printf("[重新提炼作业] 开始为数据包 (ID:%s) 唤起 LLM 更新提炼...\n", itemID)

		summary, tags, err := pkg.ExtractSummaryAndTags(rawText)
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
	}(id, text)

	return nil
}
