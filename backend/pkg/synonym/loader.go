package synonym

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"strings"

	"note_all_backend/global"
	"note_all_backend/models"
)

// ImportSynonyms 从 TXT 文件导入同义词到数据库
func ImportSynonyms(filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open synonym file: %v", err)
	}
	defer file.Close()

	// 检查是否已经导入过
	var count int64
	global.DB.Model(&models.Synonym{}).Count(&count)
	if count > 0 {
		log.Printf("[Synonym] 表中已有 %d 条数据，跳过导入。", count)
		return nil
	}

	log.Println("[Synonym] 开始导入同义词词典...")

	scanner := bufio.NewScanner(file)
	tx := global.DB.Begin()
	
	batchSize := 500
	var batch []models.Synonym

	for scanner.Scan() {
		line := scanner.Text()
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// 格式: Aa01A01= 人 士 人物 人士 人氏 人选
		var symbolPos int
		var symbol string
		if idx := strings.Index(line, "="); idx != -1 {
			symbolPos = idx
			symbol = "="
		} else if idx := strings.Index(line, "#"); idx != -1 {
			symbolPos = idx
			symbol = "#"
		} else if idx := strings.Index(line, "@"); idx != -1 {
			symbolPos = idx
			symbol = "@"
		}

		if symbol == "" {
			continue
		}

		groupID := strings.TrimSpace(line[:symbolPos])
		wordsStr := strings.TrimSpace(line[symbolPos+1:])
		words := strings.Fields(wordsStr)

		for _, w := range words {
			batch = append(batch, models.Synonym{
				GroupID: groupID,
				Word:    w,
				Type:    symbol,
			})

			if len(batch) >= batchSize {
				if err := tx.Create(&batch).Error; err != nil {
					tx.Rollback()
					return fmt.Errorf("failed to insert batch: %v", err)
				}
				batch = batch[:0]
			}
		}
	}

	if len(batch) > 0 {
		if err := tx.Create(&batch).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to insert last batch: %v", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("failed to commit transaction: %v", err)
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("error reading file: %v", err)
	}

	log.Println("[Synonym] 同义词词典导入完成。")
	return nil
}
