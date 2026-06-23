package models

import (
	"time"

	"gorm.io/gorm"
)

// PendingWikiTask 表示一条被后台嗅探器发现的潜在词条任务
type PendingWikiTask struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"deleted_at"`
	
	ConceptName string `gorm:"size:255;not null;index" json:"concept_name"` // 提取出的概念名称
	SourceNoteID uint   `gorm:"not null;index" json:"source_note_id"`         // 是从哪篇笔记里提取出来的
	Status      string `gorm:"size:32;default:'pending';index" json:"status"` // pending / accepted / rejected
}

// WikiEntity 表示编译生成的结构化词条实体
type WikiEntity struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`
	
	Name    string `gorm:"size:255;not null;uniqueIndex" json:"name"` // 词条名称，全局唯一
	Summary string `gorm:"type:text" json:"summary"`                   // 简短概括
	Content string `gorm:"type:text" json:"content"`                   // 详细的结构化 Markdown 内容
}

// WikiReference 记录具体的源笔记与生成词条之间的关联
type WikiReference struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	CreatedAt    time.Time `json:"created_at"`
	WikiEntityID uint      `gorm:"not null;index;uniqueIndex:uidx_wiki_note" json:"wiki_entity_id"`
	NoteID       uint      `gorm:"not null;index;uniqueIndex:uidx_wiki_note" json:"note_id"`
}
