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

const reviewSystemPrompt = `你是一个知识回顾助手。根据用户今天收集的碎片知识，生成一份精炼的每日知识回顾。

要求：
1. 用 Markdown 格式输出
2. 先对碎片做主题聚类（2-3个主题）
3. 每个主题下列出关键洞察
4. 最后给出知识关联建议（哪些碎片之间存在深层联系）
5. 控制总篇幅在 300 字以内
6. 语气温暖鼓励，有洞察力`

// GenerateDailyReview 生成今日回顾，触发异步生成
func GenerateDailyReview() {
	// 查询今天的碎片（本地时间）
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var notes []models.NoteItem
	global.DB.Where("created_at >= ? AND deleted_at IS NULL AND status IN ('analyzed', 'done')", today).
		Order("created_at DESC").
		Find(&notes)

	// 今日无数据则回溯近 3 天（本地时间）
	if len(notes) == 0 {
		threeDaysAgo := today.AddDate(0, 0, -3)
		global.DB.Where("created_at >= ? AND deleted_at IS NULL AND status IN ('analyzed', 'done')", threeDaysAgo).
			Order("created_at DESC").
			Limit(20).
			Find(&notes)
	}

	if len(notes) == 0 {
		log.Printf("[Review] 无可回顾的碎片")
		return
	}

	// 构建上下文
	var ctx strings.Builder
	noteIDs := make([]uint, 0, len(notes))
	for i, n := range notes {
		summary := n.AiSummary
		if summary == "" {
			summary = n.OriginalName
		}
		ctx.WriteString(fmt.Sprintf("%d. [%s] %s\n", i+1, n.OriginalName, summary))
		noteIDs = append(noteIDs, n.ID)
		if i >= 19 {
			break
		}
	}

	// 调用 LLM
	reviewText, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": fmt.Sprintf("请基于以下碎片生成今日知识回顾：\n\n%s", ctx.String())},
	}, reviewSystemPrompt)
	if err != nil {
		log.Printf("[Review] AI 回顾生成失败: %v", err)
		return
	}

	// 存入数据库
	noteIDsJSON, _ := json.Marshal(noteIDs)
	review := models.DailyReview{
		Content: strings.TrimSpace(reviewText),
		NoteIDs: string(noteIDsJSON),
	}
	if err := global.DB.Create(&review).Error; err != nil {
		log.Printf("[Review] 回顾存储失败: %v", err)
		return
	}

	// SSE 通知前端
	global.SSEBus.Publish("review_ready")

	log.Printf("[Review] 每日回顾已生成 (ID:%d)", review.ID)
}

// GetLatestReview 获取最新一次回顾
func GetLatestReview() (*models.DailyReview, error) {
	var review models.DailyReview
	err := global.DB.Order("created_at DESC").First(&review).Error
	if err != nil {
		return nil, err
	}
	return &review, nil
}
