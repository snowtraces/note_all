package models

import (
	"time"
)

// ImageTask 表示一次图片生成的全局任务（可含多张图片结果）
type ImageTask struct {
	ID         uint          `gorm:"primaryKey" json:"id"`
	CreatedAt  time.Time     `json:"created_at"`
	Prompt     string        `gorm:"type:text" json:"prompt"`
	Model      string        `gorm:"size:128" json:"model"`
	Resolution string        `gorm:"size:16" json:"resolution"` // 1k, 2k, 4k
	Ratio      string        `gorm:"size:16" json:"ratio"`      // 1:1, 16:9 
	Quantity   int           `json:"quantity"`                  // 生成的张数
	IsArchived bool          `gorm:"default:false" json:"is_archived"`
	Results    []ImageResult `gorm:"foreignKey:TaskID" json:"results"`
}

// ImageResult 属于某个 ImageTask 的单张生成结果
type ImageResult struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	TaskID   uint   `gorm:"index" json:"task_id"`
	ImageUrl string `gorm:"type:text" json:"image_url"`
}
