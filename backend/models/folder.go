package models

import (
	"time"

	"gorm.io/gorm"
)

// NoteFolder 定义一级目录配置
type NoteFolder struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`

	Name       string `gorm:"size:32;not null;uniqueIndex" json:"name"` // 目录名
	Icon       string `gorm:"size:8;not null" json:"icon"`             // Emoji图标
	IsSpecial  bool   `gorm:"default:false" json:"is_special"`         // 是否为系统特殊目录(不可删)
	SortOrder  int    `gorm:"default:0" json:"sort_order"`             // 排序权重
	Subfolders string `gorm:"type:text;default:''" json:"subfolders"`   // 存储二级分类的JSON数组，例如 ["Go", "React"]
}

var defaultFolders = []NoteFolder{
	{Name: "未分类", Icon: "📥", IsSpecial: true, SortOrder: 1},
	{Name: "照片", Icon: "📷", IsSpecial: true, SortOrder: 2},
	{Name: "任务", Icon: "✅", IsSpecial: true, SortOrder: 3},
	{Name: "回收站", Icon: "🗑️", IsSpecial: true, SortOrder: 4}, // 回收站作为特殊存在，虽无实体，但在UI常驻
	{Name: "技术", Icon: "💻", IsSpecial: false, SortOrder: 5},
	{Name: "阅读", Icon: "📖", IsSpecial: false, SortOrder: 6},
	{Name: "灵感", Icon: "💡", IsSpecial: false, SortOrder: 7},
	{Name: "工作", Icon: "📋", IsSpecial: false, SortOrder: 8},
	{Name: "学习", Icon: "📚", IsSpecial: false, SortOrder: 9},
	{Name: "网页", Icon: "🌐", IsSpecial: false, SortOrder: 10},
	{Name: "收藏", Icon: "🔗", IsSpecial: false, SortOrder: 11},
	{Name: "其他", Icon: "📦", IsSpecial: true, SortOrder: 12}, // 其他也是特殊目录，作为兜底
}

// InitFolders 初始化系统默认一级目录
func InitFolders(db *gorm.DB) error {
	var count int64
	db.Model(&NoteFolder{}).Count(&count)
	if count == 0 {
		for _, f := range defaultFolders {
			if err := db.Create(&f).Error; err != nil {
				return err
			}
		}
	} else {
		// 确保“其他”等特殊目录不会因为旧版本被遗漏，或者状态不对
		for _, f := range defaultFolders {
			if f.IsSpecial {
				var existing NoteFolder
				if err := db.Where("name = ?", f.Name).First(&existing).Error; err != nil {
					if err == gorm.ErrRecordNotFound {
						db.Create(&f)
					}
				} else if !existing.IsSpecial {
					db.Model(&existing).Update("is_special", true)
				}
			}
		}
	}
	return nil
}
