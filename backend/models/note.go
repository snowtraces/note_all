package models

import (
	"fmt"
	"strings"
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
	AiTitle     string `gorm:"size:512" json:"ai_title"`                // LLM 生成的标题
	AiSummary   string `gorm:"size:1024" json:"ai_summary"`             // AI 总结的精华摘要
	AiTags      string `gorm:"size:255" json:"ai_tags"`                 // AI 打的标签
	OriginalUrl string `gorm:"size:2048" json:"original_url"`           // [新增] 溯源网页URL
	Status      string `gorm:"size:32;default:'pending'" json:"status"` // pending/ocred/analyzed/done/error
	IsArchived  bool   `gorm:"default:false;index" json:"is_archived"`  // [新增] 是否归档
	UserComment string `gorm:"type:text" json:"user_comment"`           // 用户手动标记的批注信息

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

	Title         string `gorm:"size:255;not null" json:"title"`            // 通常是第一句提问的缩写
	ContextSummary string `gorm:"type:text" json:"context_summary"`         // 历史对话压缩摘要
	ActiveDocs     string `gorm:"size:255" json:"active_docs"`              // 当前关注文档ID JSON数组
	ActiveTopic    string `gorm:"size:255" json:"active_topic"`             // 当前话题关键词
	LastIntent     string `gorm:"size:32" json:"last_intent"`               // 上轮意图类型
}

// ChatMessage 存储对话中的每一条消息
type ChatMessage struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	ChatSessionID uint       `gorm:"not null;index" json:"session_id"`
	Role          string     `gorm:"size:16;not null" json:"role"` // user/assistant
	Content       string     `gorm:"type:text;not null" json:"content"`
	CreatedAt     time.Time  `json:"created_at"`
	References    []NoteItem `gorm:"many2many:chat_message_references;" json:"references"`
	Intent        string     `gorm:"size:32" json:"intent"`           // 该轮意图类型
	ToolCalls     string     `gorm:"type:text" json:"tool_calls"`     // 工具调用JSON
	Confidence    float32    `gorm:"default:0" json:"confidence"`     // 意图置信度
}

// SetupDBWithFTS 初始化数据库结构，包括建立 FTS5 虚拟表及与基础表联动的触发器
func SetupDBWithFTS(db *gorm.DB) error {
	// 1. 自动迁移主表 + 标签关联表 + NoteLink双链表 + 对话表 + 提示词模板表 + 微信相关表 + 分片向量表 + 文件元数据表 + 图片生成表 + 定时任务表
	if err := db.AutoMigrate(&NoteItem{}, &NoteTag{}, &NoteLink{}, &ChatSession{}, &ChatMessage{}, &PromptTemplate{}, &ShareLink{}, &WeixinBotCredential{}, &WeixinUserContext{}, &WeixinMessage{}, &NoteChunk{}, &NoteChunkEmbedding{}, &FileMetadata{}, &ImageTask{}, &ImageResult{}, &DailyReview{}, &CronTask{}, &CronTaskLog{}, &ExtractorRule{}, &SystemSetting{}); err != nil {
		return fmt.Errorf("failed to migrate tables: %v", err)
	}

	// 1.5 初始化预设模板
	if err := InitTemplates(db); err != nil {
		return fmt.Errorf("failed to init templates: %v", err)
	}

	// 2. 检测并迁移旧版 FTS 表（旧版缺少 ai_title 列时需重建）
	var ftsSQL string
	if err := db.Raw("SELECT sql FROM sqlite_master WHERE type='table' AND name='note_fts'").Scan(&ftsSQL).Error; err != nil {
		return fmt.Errorf("failed to check fts5 schema: %v", err)
	}
	if ftsSQL != "" && !strings.Contains(ftsSQL, "ai_title") {
		// 旧版 FTS 表缺少 ai_title 列，删除后重建并重新填充数据
		if err := db.Exec("DROP TABLE IF EXISTS note_fts").Error; err != nil {
			return fmt.Errorf("failed to drop old fts5 table: %v", err)
		}
	}

	ftsSchema := `
	CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
		storage_id,
		original_name,
		ocr_text,
		ai_title,
		ai_summary,
		ai_tags,
		tokenize='trigram'
	);
	`
	if err := db.Exec(ftsSchema).Error; err != nil {
		return fmt.Errorf("failed to create fts5 table: %v", err)
	}

	// 如果 FTS 表刚被重建，重新填充全量数据
	if ftsSQL != "" && !strings.Contains(ftsSQL, "ai_title") {
		if err := db.Exec(`
			INSERT INTO note_fts(rowid, storage_id, original_name, ocr_text, ai_title, ai_summary, ai_tags)
			SELECT id, storage_id, original_name, ocr_text, ai_title, ai_summary, ai_tags
			FROM note_items WHERE deleted_at IS NULL
		`).Error; err != nil {
			return fmt.Errorf("failed to rebuild fts5 data: %v", err)
		}
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
			 INSERT INTO note_fts(rowid, storage_id, original_name, ocr_text, ai_title, ai_summary, ai_tags)
			 VALUES (new.id, new.storage_id, new.original_name, new.ocr_text, new.ai_title, new.ai_summary, new.ai_tags);
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
			 INSERT INTO note_fts(rowid, storage_id, original_name, ocr_text, ai_title, ai_summary, ai_tags)
			 SELECT new.id, new.storage_id, new.original_name, new.ocr_text, new.ai_title, new.ai_summary, new.ai_tags
			 WHERE new.deleted_at IS NULL;
		 END;`,
	}

	for _, t := range triggers {
		if err := db.Exec(t).Error; err != nil {
			return fmt.Errorf("failed to create trigger: %v", err)
		}
	}

	// 初始化同义词 FTS
	if err := SetupSynonymFTS(db); err != nil {
		return fmt.Errorf("failed to setup synonym fts: %v", err)
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
