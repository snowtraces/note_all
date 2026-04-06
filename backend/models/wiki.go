package models

import (
	"time"

	"gorm.io/gorm"
)

// WikiEntry 知识词条：由 AI 从多个原始碎片中提炼汇总的概念聚合体
// 类比 Wikipedia 的词条，每条代表一个「概念」或「主题」
type WikiEntry struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`

	// 词条核心内容
	Title   string `gorm:"size:255;not null;uniqueIndex" json:"title"`    // 词条标题（概念名，全局唯一）
	Summary string `gorm:"size:1024" json:"summary"`                      // 一句话摘要（AI 生成，人类可修改）
	Body    string `gorm:"type:text" json:"body"`                         // 正文 Markdown（AI 编纂）
	Status  string `gorm:"size:32;default:'draft'" json:"status"`         // draft / published / archived

	// AI 编辑元信息
	LastAiEditAt *time.Time `json:"last_ai_edit_at"` // 上次 AI 修订时间
	EditCount    int        `gorm:"default:0" json:"edit_count"` // 总修订次数（含 AI 与人工）

	// 关联（多对多）
	Sources       []NoteItem  `gorm:"many2many:wiki_sources;" json:"sources,omitempty"`            // 来源碎片
	LinkedEntries []WikiEntry `gorm:"many2many:wiki_links;joinForeignKey:WikiID;joinReferences:LinkedID" json:"linked_entries,omitempty"` // 关联词条
	Tags          []WikiTag   `gorm:"foreignKey:WikiID" json:"tags,omitempty"`                     // 词条标签
}

// WikiTag 词条标签
type WikiTag struct {
	ID     uint   `gorm:"primaryKey" json:"id"`
	WikiID uint   `gorm:"not null;index;uniqueIndex:uidx_wiki_tag" json:"wiki_id"`
	Tag    string `gorm:"size:64;not null;index;uniqueIndex:uidx_wiki_tag" json:"tag"`
}

// WikiVersion 词条历史版本，记录每次修改的完整正文快照
type WikiVersion struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	WikiID    uint      `gorm:"not null;index" json:"wiki_id"`
	CreatedAt time.Time `json:"created_at"`

	BodySnapshot string `gorm:"type:text" json:"body_snapshot"` // 该版本正文快照
	EditSummary  string `gorm:"size:512" json:"edit_summary"`   // 修改说明（AI 自填或人工填写）
	EditedBy     string `gorm:"size:16" json:"edited_by"`       // "ai" | "user"
}
