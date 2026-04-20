package models

import (
	"time"

	"gorm.io/gorm"
)

// FileMetadata 独立的文件元数据表，用于存储任意文件的基本信息
type FileMetadata struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`

	StorageID string `gorm:"size:128;uniqueIndex;not null" json:"storage_id"` // 关联 snow_storage
	MimeType  string `gorm:"size:64" json:"mime_type"`                        // 如 image/png, application/pdf 等
	FileSize  int64  `json:"file_size"`
	FileName  string `gorm:"size:255" json:"file_name"`                       // 原始文件名（可选）
}