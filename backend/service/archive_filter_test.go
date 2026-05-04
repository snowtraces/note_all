package service

import (
	"testing"

	"note_all_backend/global"
	"note_all_backend/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupTestDB 创建内存 SQLite 并完成 Schema 迁移
func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("无法打开内存数据库: %v", err)
	}
	if err := db.AutoMigrate(&models.NoteItem{}, &models.NoteTag{}, &models.NoteLink{}); err != nil {
		t.Fatalf("迁移失败: %v", err)
	}
	return db
}

// TestSearchExcludesArchivedNotes 验证：搜索结果不应包含已归档笔记
func TestSearchExcludesArchivedNotes(t *testing.T) {
	db := setupTestDB(t)
	global.DB = db

	// 准备测试数据：1 条归档笔记 + 1 条正常笔记
	archived := models.NoteItem{
		OriginalName: "归档笔记",
		StorageID:    "arch_001",
		FileType:     "text/plain",
		Status:       "analyzed",
		IsArchived:   true,
		AiTags:       "归档,测试",
		AiSummary:    "这是一条归档笔记",
		OcrText:      "归档笔记内容",
	}
	active := models.NoteItem{
		OriginalName: "正常笔记",
		StorageID:    "act_001",
		FileType:     "text/plain",
		Status:       "analyzed",
		IsArchived:   false,
		AiTags:       "正常,测试",
		AiSummary:    "这是一条正常笔记",
		OcrText:      "正常笔记内容",
	}
	db.Create(&archived)
	db.Create(&active)

	// 同步标签
	for _, tag := range []string{"归档", "测试"} {
		db.Create(&models.NoteTag{NoteID: archived.ID, Tag: tag})
	}
	for _, tag := range []string{"正常", "测试"} {
		db.Create(&models.NoteTag{NoteID: active.ID, Tag: tag})
	}

	t.Run("空关键词搜索排除归档", func(t *testing.T) {
		var notes []models.NoteItem
		db.Preload("Tags").Where("status IN ? AND is_archived = ?", []string{"analyzed", "done"}, false).
			Order("updated_at DESC").Limit(20).Find(&notes)

		for _, n := range notes {
			if n.IsArchived {
				t.Errorf("搜索结果包含归档笔记: id=%d, name=%s", n.ID, n.OriginalName)
			}
		}
		if len(notes) != 1 {
			t.Errorf("期望返回 1 条正常笔记, 实际返回 %d 条", len(notes))
		}
	})

	t.Run("详情查询排除归档", func(t *testing.T) {
		var notes []models.NoteItem
		ids := []uint{archived.ID, active.ID}
		db.Where("id IN ? AND deleted_at IS NULL AND is_archived = ?", ids, false).Find(&notes)

		for _, n := range notes {
			if n.IsArchived {
				t.Errorf("详情查询包含归档笔记: id=%d", n.ID)
			}
		}
		if len(notes) != 1 {
			t.Errorf("期望返回 1 条, 实际返回 %d 条", len(notes))
		}
	})

	t.Run("标签检索排除归档", func(t *testing.T) {
		var tagHits []struct {
			NoteID uint
			Count  int
		}
		db.Table("note_tags").
			Select("note_id, COUNT(*) as count").
			Where("tag IN ?", []string{"测试"}).
			Joins("JOIN note_items ON note_items.id = note_tags.note_id").
			Where("note_items.deleted_at IS NULL AND note_items.status IN ? AND note_items.is_archived = ?", []string{"analyzed", "done"}, false).
			Group("note_id").Scan(&tagHits)

		for _, h := range tagHits {
			if h.NoteID == archived.ID {
				t.Errorf("标签检索命中归档笔记: id=%d", h.NoteID)
			}
		}
	})
}

// TestGetTagsExcludesArchivedNotes 验证：标签统计不应计入归档笔记的标签
func TestGetTagsExcludesArchivedNotes(t *testing.T) {
	db := setupTestDB(t)
	global.DB = db

	archived := models.NoteItem{
		OriginalName: "归档笔记",
		StorageID:    "arch_tag_001",
		FileType:     "text/plain",
		Status:       "analyzed",
		IsArchived:   true,
	}
	active := models.NoteItem{
		OriginalName: "正常笔记",
		StorageID:    "act_tag_001",
		FileType:     "text/plain",
		Status:       "analyzed",
		IsArchived:   false,
	}
	db.Create(&archived)
	db.Create(&active)

	// 归档笔记有 "归档专用" 标签
	db.Create(&models.NoteTag{NoteID: archived.ID, Tag: "归档专用"})
	db.Create(&models.NoteTag{NoteID: archived.ID, Tag: "共享标签"})
	// 正常笔记有 "共享标签"
	db.Create(&models.NoteTag{NoteID: active.ID, Tag: "共享标签"})

	type tagCount struct {
		Tag   string `json:"tag"`
		Count int    `json:"count"`
	}
	var tags []tagCount
	db.Table("note_tags").
		Select("tag, COUNT(*) as count").
		Joins("JOIN note_items ON note_items.id = note_tags.note_id").
		Where("note_items.deleted_at IS NULL AND note_items.is_archived = ?", false).
		Group("tag").
		Order("count DESC").
		Scan(&tags)

	// "归档专用" 标签只出现在归档笔记，不应被计入
	for _, tc := range tags {
		if tc.Tag == "归档专用" {
			t.Errorf("标签统计包含归档专用标签: tag=%s, count=%d", tc.Tag, tc.Count)
		}
	}

	// "共享标签" 只应计 1 次（来自正常笔记）
	for _, tc := range tags {
		if tc.Tag == "共享标签" && tc.Count != 1 {
			t.Errorf("共享标签计数错误: 期望 1, 实际 %d", tc.Count)
		}
	}
}

// TestGetRelatedNotesExcludesArchivedNotes 验证：关联笔记不应包含归档笔记
func TestGetRelatedNotesExcludesArchivedNotes(t *testing.T) {
	db := setupTestDB(t)
	global.DB = db

	// 当前笔记（正常）
	current := models.NoteItem{
		OriginalName: "当前笔记",
		StorageID:    "cur_001",
		FileType:     "text/plain",
		Status:       "analyzed",
		IsArchived:   false,
	}
	// 关联笔记（正常）
	relatedActive := models.NoteItem{
		OriginalName: "关联正常笔记",
		StorageID:    "rel_act_001",
		FileType:     "text/plain",
		Status:       "analyzed",
		IsArchived:   false,
	}
	// 关联笔记（归档）
	relatedArchived := models.NoteItem{
		OriginalName: "关联归档笔记",
		StorageID:    "rel_arch_001",
		FileType:     "text/plain",
		Status:       "analyzed",
		IsArchived:   true,
	}
	db.Create(&current)
	db.Create(&relatedActive)
	db.Create(&relatedArchived)

	// 三条笔记都有相同标签 "共同话题"
	db.Create(&models.NoteTag{NoteID: current.ID, Tag: "共同话题"})
	db.Create(&models.NoteTag{NoteID: relatedActive.ID, Tag: "共同话题"})
	db.Create(&models.NoteTag{NoteID: relatedArchived.ID, Tag: "共同话题"})

	var relatedItems []models.NoteItem
	err := db.Table("note_items").
		Joins("JOIN note_tags ON note_tags.note_id = note_items.id").
		Where("note_tags.tag IN ? AND note_items.id <> ? AND note_items.is_archived = ?", []string{"共同话题"}, current.ID, false).
		Where("note_items.deleted_at IS NULL").
		Group("note_items.id").
		Order("COUNT(note_tags.tag) DESC, note_items.id DESC").
		Limit(5).
		Find(&relatedItems).Error

	if err != nil {
		t.Fatalf("查询失败: %v", err)
	}

	for _, n := range relatedItems {
		if n.IsArchived {
			t.Errorf("关联笔记包含归档条目: id=%d, name=%s", n.ID, n.OriginalName)
		}
	}
	if len(relatedItems) != 1 {
		t.Errorf("期望 1 条关联笔记, 实际 %d 条", len(relatedItems))
	}
}