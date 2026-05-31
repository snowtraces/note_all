package models

import (
	"time"

	"gorm.io/gorm"
)

// PromptTemplate 定义了 AI 处理的提示词模板
type PromptTemplate struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`

	Name         string `gorm:"size:128;not null" json:"name"`            // 模板名称
	SystemPrompt string `gorm:"type:text;not null" json:"system_prompt"` // 完整的提示词模板
	IsActive     bool   `gorm:"default:false;index" json:"is_active"`    // 是否为当前激活的模板
	IsBuiltin    bool   `gorm:"default:false" json:"is_builtin"`         // 是否为系统内置模板（不可删除）
}

// 默认的几个系统预设模板
var defaultTemplates = []PromptTemplate{
	{
		Name: "通用抽取 (默认)",
		SystemPrompt: "你是一个精干的知识库文本提炼助理。用户会给你一段从图片/截图中OCR扫描出来的杂乱文字，或者网页剪藏文字。\n" +
			"请你做三件事：\n" +
			"1. 用不超过20个字概括一个简练标题（title），提炼核心主题。\n" +
			"2. 用不超过50个字的简练句子概括核心内容（summary）（若输入源文本少于50字，摘要直接等同于输入源文本）。\n" +
			"3. 提取最具有分类意义的1-5个词语作为标签(Tags)，使用中英半角逗号分隔。\n\n" +
			"你必须严格只输出以下格式的JSON内容，不允许有任何额外的Markdown包裹和闲聊句子：\n" +
			`{"title":"简练标题","summary":"你的概括结论","tags":"标签1,标签2,标签3"}`,
		IsActive:  true,
		IsBuiltin: true,
	},
	{
		Name: "学习笔记",
		SystemPrompt: "你是一个学习笔记提炼助手。用户会输入一段学习过程中的笔记或摘抄。\n" +
			"请你做三件事：\n" +
			"1. 用不超过20个字概括一个简练标题（title），提炼核心知识点。\n" +
			"2. 用不超过100个字总结这段笔记的核心知识点或感悟（summary）。\n" +
			"3. 提取最核心的1-5个概念名词作为标签(Tags)，使用中英半角逗号分隔。\n\n" +
			"你必须严格只输出以下格式的JSON内容，不允许有任何额外的Markdown包裹：\n" +
			`{"title":"简练标题","summary":"你的知识点总结","tags":"概念1,概念2"}`,
		IsActive:  false,
		IsBuiltin: true,
	},
	{
		Name: "代码片段",
		SystemPrompt: "你是一个高级程序员。用户会输入一段代码或与编程相关的技术文本。\n" +
			"请你做三件事：\n" +
			"1. 用不超过20个字概括一个简练标题（title），描述代码功能或解决的问题。\n" +
			"2. 用一句话概括这段代码/文本的功能或解决的问题（summary）。\n" +
			"3. 提取所涉及的编程语言、框架、库或核心技术术语作为标签(Tags)，最多5个，使用半角逗号分隔。\n\n" +
			"你必须严格按以下JSON格式输出，不要有额外的Markdown：\n" +
			`{"title":"简练标题","summary":"代码功能概括","tags":"技术1,技术2"}`,
		IsActive:  false,
		IsBuiltin: true,
	},
	{
		Name: "阅读书摘",
		SystemPrompt: "你是一个阅读助手。用户会分享书摘或长文片段。\n" +
			"请你做三件事：\n" +
			"1. 用不超过20个字概括一个简练标题（title），提炼中心思想。\n" +
			"2. 提炼出这段文字的中心思想或最精彩的论点（summary），不要超过100字。\n" +
			"3. 提取作者名、书名或文章类别作为重点标签(Tags)，加上几个核心主题词，最多5个，半角逗号分隔。\n\n" +
			"严格只输出JSON格式：\n" +
			`{"title":"简练标题","summary":"提炼的中心思想","tags":"标签1,标签2"}`,
		IsActive:  false,
		IsBuiltin: true,
	},
}

// InitTemplates 初始化内置模板
func InitTemplates(db *gorm.DB) error {
	var count int64
	db.Model(&PromptTemplate{}).Count(&count)
	if count == 0 {
		// 数据库中为空，插入默认模板
		for _, tpl := range defaultTemplates {
			if err := db.Create(&tpl).Error; err != nil {
				return err
			}
		}
	} else {
		// 数据库已有数据，按名称同步更新内置模板的 SystemPrompt
		for _, tpl := range defaultTemplates {
			db.Model(&PromptTemplate{}).
				Where("name = ? AND is_builtin = ?", tpl.Name, true).
				Update("system_prompt", tpl.SystemPrompt)
		}
	}
	return nil
}

// GetActiveTemplate 获取当前激活的模板
func GetActiveTemplate(db *gorm.DB) (PromptTemplate, error) {
	var tpl PromptTemplate
	err := db.Where("is_active = ?", true).First(&tpl).Error
	if err != nil {
		// 如果找不到激活的，就返回默认通用的那个
		return defaultTemplates[0], err
	}
	return tpl, nil
}