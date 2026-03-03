package models

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// NoteItem 存储记录的核心结构
type NoteItem struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`

	// 基础文件元信息
	OriginalName string `gorm:"size:255;not null" json:"original_name"`
	StorageID    string `gorm:"size:128;uniqueIndex;not null" json:"storage_id"` // 关联 snow_storage
	FileType     string `gorm:"size:64" json:"file_type"`                        // 如 image/png, text/plain 等
	FileSize     int64  `json:"file_size"`

	// 内容解析
	OcrText   string `gorm:"type:text" json:"ocr_text"`               // OCR原始大宗文本，不主要依赖like模糊查询，将同步到FTS5表中
	AiSummary string `gorm:"size:1024" json:"ai_summary"`             // AI 总结的精华摘要
	AiTags    string `gorm:"size:255" json:"ai_tags"`                 // AI 打的标签 (JSON 数组格式或者纯逗号间隔格式)
	Status    string `gorm:"size:32;default:'pending'" json:"status"` // pending/ocred/analyzed/error
}

// SetupDBWithFTS 初始化数据库结构，包括建立 FTS5 虚拟表及与基础表联动的触发器
func SetupDBWithFTS(db *gorm.DB) error {
	// 1. 自动迁移主表
	err := db.AutoMigrate(&NoteItem{})
	if err != nil {
		return fmt.Errorf("failed to migrate main table: %v", err)
	}

	// 2. 建立 FTS5 虚拟表 (仅在不存在时建立)。注意：SQLite FTS5 原生支持简单的词法分词器，
	// 如果需要实现超严格中文切词，可能要挂载 simple/jieba 分词，但这有损于单体跨平台编译。
	// KISS原则下：我们选用默认分词器搭配 unicode61 即可应对普通中文搜索。
	ftsSchema := `
	CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
		storage_id,
		original_name,
		ocr_text,
		ai_summary,
		ai_tags,
		tokenize='trigram'
	);
	`
	if err := db.Exec(ftsSchema).Error; err != nil {
		return fmt.Errorf("failed to create fts5 table: %v", err)
	}

	// 3. 建立触发器，使得 note_items 表的数据变化自动倒推同步进虚拟表中。(且支持逻辑删除，软删除记录不放入 FTS5)
	triggers := []string{
		"DROP TRIGGER IF EXISTS trg_note_insert;",
		"DROP TRIGGER IF EXISTS trg_note_delete;",
		"DROP TRIGGER IF EXISTS trg_note_update;",

		// 插入时，如果是正常数据才进入全文检索
		`CREATE TRIGGER trg_note_insert AFTER INSERT ON note_items
		 WHEN new.deleted_at IS NULL
		 BEGIN
			 INSERT INTO note_fts(rowid, storage_id, original_name, ocr_text, ai_summary, ai_tags)
			 VALUES (new.id, new.storage_id, new.original_name, new.ocr_text, new.ai_summary, new.ai_tags);
		 END;`,

		// 删除时 (物理删除的情况)
		`CREATE TRIGGER trg_note_delete AFTER DELETE ON note_items
		 BEGIN
			 DELETE FROM note_fts WHERE rowid = old.id;
		 END;`,

		// 更新时 (如果是被软删除，new.deleted_at 就不再是空，所以只插入不为软删除的记录)
		`CREATE TRIGGER trg_note_update AFTER UPDATE ON note_items
		 BEGIN
			 DELETE FROM note_fts WHERE rowid = old.id;
			 INSERT INTO note_fts(rowid, storage_id, original_name, ocr_text, ai_summary, ai_tags)
			 SELECT new.id, new.storage_id, new.original_name, new.ocr_text, new.ai_summary, new.ai_tags
			 WHERE new.deleted_at IS NULL;
		 END;`,
	}

	for _, t := range triggers {
		if err := db.Exec(t).Error; err != nil {
			return fmt.Errorf("failed to create trigger: %v", err)
		}
	}

	return nil
}
