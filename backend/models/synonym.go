package models

import (
	"fmt"
	"gorm.io/gorm"
)

// Synonym 同义词记录
type Synonym struct {
	ID      uint   `gorm:"primaryKey" json:"id"`
	GroupID string `gorm:"size:32;index" json:"group_id"` // 词林编码，如 Aa01A01
	Word    string `gorm:"size:64;index" json:"word"`     // 同义词
	Type    string `gorm:"size:8" json:"type"`           // 关系类型: =, #, @
}

// SetupSynonymFTS 初始化同义词 FTS 表
func SetupSynonymFTS(db *gorm.DB) error {
	// 1. 自动迁移基础表
	if err := db.AutoMigrate(&Synonym{}); err != nil {
		return fmt.Errorf("failed to migrate synonyms table: %v", err)
	}

	// 2. 建立 FTS5 虚拟表
	ftsSchema := `
	CREATE VIRTUAL TABLE IF NOT EXISTS synonym_fts USING fts5(
		word,
		tokenize='trigram'
	);
	`
	if err := db.Exec(ftsSchema).Error; err != nil {
		return fmt.Errorf("failed to create synonym_fts table: %v", err)
	}

	// 3. 建立触发器
	triggers := []string{
		"DROP TRIGGER IF EXISTS trg_synonym_insert;",
		"DROP TRIGGER IF EXISTS trg_synonym_delete;",
		"DROP TRIGGER IF EXISTS trg_synonym_update;",

		`CREATE TRIGGER trg_synonym_insert AFTER INSERT ON synonyms
		 BEGIN
			 INSERT INTO synonym_fts(rowid, word) VALUES (new.id, new.word);
		 END;`,

		`CREATE TRIGGER trg_synonym_delete AFTER DELETE ON synonyms
		 BEGIN
			 DELETE FROM synonym_fts WHERE rowid = old.id;
		 END;`,

		`CREATE TRIGGER trg_synonym_update AFTER UPDATE ON synonyms
		 BEGIN
			 DELETE FROM synonym_fts WHERE rowid = old.id;
			 INSERT INTO synonym_fts(rowid, word) VALUES (new.id, new.word);
		 END;`,
	}

	for _, t := range triggers {
		if err := db.Exec(t).Error; err != nil {
			return fmt.Errorf("failed to create synonym trigger: %v", err)
		}
	}

	return nil
}
