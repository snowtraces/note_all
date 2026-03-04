package service

import (
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"path/filepath"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg"

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
func CreateNoteFromText(text string) (*models.NoteItem, error) {
	// 取文本前 30 个字符作为名称
	runes := []rune(strings.TrimSpace(text))
	name := string(runes)
	if len(runes) > 30 {
		name = string(runes[:30]) + "..."
	}
	if name == "" {
		name = "文本录入"
	}

	// 虚拟 storageID，不写入物理存储
	storageID := fmt.Sprintf("text_%d", time.Now().UnixNano())

	note := models.NoteItem{
		OriginalName: name,
		StorageID:    storageID,
		FileType:     "text/plain",
		FileSize:     int64(len(text)),
		Status:       "pending",
	}

	if err := global.DB.Create(&note).Error; err != nil {
		return nil, fmt.Errorf("数据库元数据建立失败: %v", err)
	}

	// 后台异步 LLM 提炼
	go func(nID uint, rawText string) {
		log.Printf("[文本录入作业] 开始为数据包 (ID:%d) 唤起 LLM 提炼...\n", nID)

		summary, tags, err := pkg.ExtractSummaryAndTags(rawText)
		if err != nil {
			log.Printf("[大模型提炼失败降级] 记录ID %d: %v", nID, err)
			summary = rawText
			tags = "ai-fail"
		}

		global.DB.Model(&models.NoteItem{}).Where("id = ?", nID).Updates(map[string]interface{}{
			"ocr_text":   rawText,
			"ai_summary": summary,
			"ai_tags":    tags,
			"status":     "analyzed",
		})

		syncTags(nID, tags)

		log.Printf("[文本录入作业完成] 记录ID %d: 提取精简摘要 [%s]...", nID, summary)
	}(note.ID, text)

	return &note, nil
}
