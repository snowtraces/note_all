package service

import (
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"path/filepath"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg"
)

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

		log.Printf("[后台作业总链完成] 记录ID %d: PaddleOCR 与 文心大模型 融合全链路结束！提取精简摘要 [%s]...", nID, summary)

	}(note.ID, note.StorageID, note.OriginalName)

	return &note, nil
}
