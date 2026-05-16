package models

import (
	"time"

	"gorm.io/gorm"
)

// CronTask 定时任务核心表
type CronTask struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`

	Name     string `gorm:"size:128;not null" json:"name"`
	TaskType string `gorm:"size:64" json:"task_type"` // [已废弃] 旧版单一任务类型，迁移后不再使用
	Status   string `gorm:"size:32;default:'paused';index" json:"status"` // active (启用), paused (暂停)

	// 调度方案
	ScheduleType  string `gorm:"size:32;default:'interval'" json:"schedule_type"` // interval (分钟间隔), cron (Cron表达式)
	ScheduleValue string `gorm:"size:128;not null" json:"schedule_value"`         // "1440" (分钟数) 或 "0 9 * * *" (每天早9点)

	// [已废弃] 旧版扁平配置，迁移后不再使用
	Config string `gorm:"type:text" json:"config"`

	// 管道节点配置 (JSON 数组字符串，最多 4 步)
	// 示例: [{"step":1,"name":"爬取","action":"web_crawl","input":{...}}, ...]
	Steps string `gorm:"type:text" json:"steps"`

	// 推送设置（存储 JSON 字符串）
	// 例如：{"push_wechat_bot": true, "push_email": true, "email_to": "test@test.com"}
	Notification string `gorm:"type:text" json:"notification"`

	LastRunTime *time.Time `json:"last_run_time"`
	NextRunTime *time.Time `gorm:"index" json:"next_run_time"`
}

// CronTaskLog 定时任务运行日志表
type CronTaskLog struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	TaskID        uint      `gorm:"not null;index" json:"task_id"`
	StartTime     time.Time `json:"start_time"`
	EndTime       time.Time `json:"end_time"`
	Status        string    `gorm:"size:32;index" json:"status"`   // success (成功), failure (失败), running (运行中)
	ResultSummary string    `gorm:"type:text" json:"result_summary"` // 结果摘要
	ErrorMessage  string    `gorm:"type:text" json:"error_message"`  // 详细错误日志
	StepResults   string    `gorm:"type:text" json:"step_results"`   // 管道每步执行详情 (JSON 数组)
}

// ExtractorRule 自定义网页 CSS 正则抽取配置表
type ExtractorRule struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`

	Name             string `gorm:"size:128;not null" json:"name"`
	UrlPattern       string `gorm:"size:255;not null;uniqueIndex" json:"url_pattern"` // URL 匹配正则，如：^https://mp.weixin.qq.com/s/.*
	RuleType         string `gorm:"size:32;default:'detail'" json:"rule_type"`        // "detail" (单网页明细) 或 "list" (列表聚合)
	ItemSelector     string `gorm:"size:255" json:"item_selector"`                    // 列表模式下的单项容器选择器，如：.artitleList2 > ul > li
	LinkSelector     string `gorm:"size:255" json:"link_selector"`                    // 列表模式下的链接提取选择器，如：.title a
	TitleSelector    string `gorm:"size:255;not null" json:"title_selector"`          // CSS选择器
	BodySelector     string `gorm:"size:255;not null" json:"body_selector"`           // CSS选择器
	AuthorSelector   string `gorm:"size:255" json:"author_selector"`                  // CSS选择器
	DateSelector     string `gorm:"size:255" json:"date_selector"`                    // CSS选择器
	ExcludeSelectors string `gorm:"type:text" json:"exclude_selectors"`               // 过滤干扰CSS选择器，逗号分隔
}

// SystemSetting 持久化配置表
type SystemSetting struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	Key       string         `gorm:"size:128;uniqueIndex;not null" json:"key"` // 配置项唯一标识
	Value     string         `gorm:"type:text;not null" json:"value"`          // 存储 JSON 字符串
}
