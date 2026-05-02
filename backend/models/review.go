package models

import "time"

// DailyReview 每日回顾记录
type DailyReview struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Content   string    `gorm:"type:text" json:"content"`
	NoteIDs   string    `gorm:"type:text" json:"note_ids"`
	CreatedAt time.Time `json:"created_at" gorm:"index"`
}
