package models

import (
	"time"

	"gorm.io/gorm"
)

// ShareLink 分享链接模型
type ShareLink struct {
	ID        string         `gorm:"primaryKey;type:varchar(64)" json:"id"` // 唯一的、不可推测的分享 ID (UUID 或随机短码)
	NoteItemID uint           `gorm:"index" json:"note_id"`                  // 被分享的笔记 ID
	NoteItem   NoteItem       `gorm:"foreignKey:NoteItemID" json:"note"`     // 关联的笔记项
	ExpiresAt  *time.Time     `json:"expires_at"`                            // 过期时间 (可选)
	CreatedAt  time.Time      `json:"created_at"`                            // 创建时间
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}
