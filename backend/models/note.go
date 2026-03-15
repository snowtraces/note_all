package models

import (
	"fmt"
	// "strings"
	"time"

	"gorm.io/gorm"
	// gormClause "gorm.io/gorm/clause"
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
	OcrText     string `gorm:"type:text" json:"ocr_text"`               // OCR原始大宗文本
	AiSummary   string `gorm:"size:1024" json:"ai_summary"`             // AI 总结的精华摘要
	AiTags      string `gorm:"size:255" json:"ai_tags"`                 // AI 打的标签
	OriginalUrl string `gorm:"size:2048" json:"original_url"`           // [新增] 溯源网页URL
	Status      string `gorm:"size:32;default:'pending'" json:"status"` // pending/ocred/analyzed/error
	IsArchived  bool   `gorm:"default:false;index" json:"is_archived"`  // [新增] 是否归档

	// 关联
	Tags    []NoteTag  `gorm:"foreignKey:NoteID" json:"tags"`
	Parents []NoteItem `gorm:"many2many:note_relations;joinForeignKey:NoteID;joinReferences:ParentID" json:"parents"`
}

// NoteTag 标签-文件扁平关联表（每行代表一个文件拥有一个标签）
type NoteTag struct {
	ID     uint   `gorm:"primaryKey" json:"id"`
	NoteID uint   `gorm:"not null;index;uniqueIndex:uidx_note_tag" json:"note_id"`
	Tag    string `gorm:"size:64;not null;index;uniqueIndex:uidx_note_tag" json:"tag"`
}

// NoteLink 双向链接记录表 ( [[内部链接]])
type NoteLink struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	SourceID uint   `gorm:"not null;index;uniqueIndex:uidx_note_link" json:"source_id"`
	Target   string `gorm:"size:255;not null;index;uniqueIndex:uidx_note_link" json:"target"`
}

// ChatSession 存储对话会话
type ChatSession struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`

	Title string `gorm:"size:255;not null" json:"title"` // 通常是第一句提问的缩写
}

// ChatMessage 存储对话中的每一条消息
type ChatMessage struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	ChatSessionID uint       `gorm:"not null;index" json:"session_id"`
	Role          string     `gorm:"size:16;not null" json:"role"` // user/assistant
	Content       string     `gorm:"type:text;not null" json:"content"`
	CreatedAt     time.Time  `json:"created_at"`
	References    []NoteItem `gorm:"many2many:chat_message_references;" json:"references"`
}

// SetupDBWithFTS 初始化数据库结构，包括建立 FTS5 虚拟表及与基础表联动的触发器
func SetupDBWithFTS(db *gorm.DB) error {
	// 1. 自动迁移主表 + 标签关联表 + NoteLink双链表 + 对话表 + 提示词模板表
	if err := db.AutoMigrate(&NoteItem{}, &NoteTag{}, &NoteLink{}, &ChatSession{}, &ChatMessage{}, &PromptTemplate{}); err != nil {
		return fmt.Errorf("failed to migrate tables: %v", err)
	}

	// 1.5 初始化预设模板
	if err := InitTemplates(db); err != nil {
		return fmt.Errorf("failed to init templates: %v", err)
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

/* 历史标签数据回填任务已完成。
// BackfillNoteTags 将历史 note_items 中已有的 ai_tags 同步写入 note_tags 关联表。
// 幂等：依赖 (note_id, tag) 唯一索引，重复运行不会产生脏数据。
func BackfillNoteTags(db *gorm.DB) error {
	type row struct {
		ID     uint
		AiTags string
	}
	var rows []row
	if err := db.Model(&NoteItem{}).
		Select("id, ai_tags").
		Where("ai_tags IS NOT NULL AND ai_tags != '' AND ai_tags != 'ai-fail' AND deleted_at IS NULL").
		Find(&rows).Error; err != nil {
		return fmt.Errorf("backfill: 读取 note_items 失败: %v", err)
	}

	total := 0
	for _, r := range rows {
		var tagRecords []NoteTag
		for _, t := range strings.Split(r.AiTags, ",") {
			t = strings.TrimSpace(t)
			if t != "" {
				tagRecords = append(tagRecords, NoteTag{NoteID: r.ID, Tag: t})
			}
		}
		if len(tagRecords) == 0 {
			continue
		}
		// OnConflict DoNothing：已存在的 (note_id, tag) 跳过，不报错
		if err := db.Clauses(gormClause.OnConflict{DoNothing: true}).Create(&tagRecords).Error; err != nil {
			return fmt.Errorf("backfill: 写入 note_tags 失败 (note_id=%d): %v", r.ID, err)
		}
		total += len(tagRecords)
	}
	return nil
}
*/
