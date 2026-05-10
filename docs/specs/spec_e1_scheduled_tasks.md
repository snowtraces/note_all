# SPEC: Phase E1 定时任务及附属功能

> **状态**: 🟢 进行中 (规划设计阶段)
> **优先级**: 🔴 P0
> **预计交付**: 2026 Q2
> **设计版本**: 1.1 (已更新用户确认反馈：包含频率限制与数据库配置持久化)

---

## 1. Objective (功能定位与核心价值)

### 1.1 功能定位
定时任务与网页抽取系统旨在为 Note All 引入**主动获取信息**与**异步自动化**的能力。从被动“接受截图/文本”升级为主动“抓取网页、解析邮件、订阅 RSS”，并将执行结果及时推送到用户常用的微信端与邮箱中，形成完整的知识流闭环。

### 1.2 目标用户与使用场景
1. **聚合阅读者**: 每天定时抓取特定技术博客、新闻网站的内容，转换成干净的 Markdown 归档在 Note All 中，供后续 RAG 或阅读。
2. **舆情监控/自媒体**: 设定 URL 正则抽取规则，对多站点的特定文章进行精准版面清洗，去除侧边栏和广告，只提炼正文。
3. **自动化助手**: 每天定时生成昨日的“知识卡片复习摘要”并主动通过企业微信 Webhook/邮箱推送给自己，免去手动打开 App 的繁琐。
4. **多源接入者**: 预留 RSS、POP3 邮件拉取等管道，将分散在外的知识点源源不断导入单库。

### 1.3 核心业务逻辑架构图

```mermaid
flowchart TD
    Scheduler[Go Background Scheduler (1分钟 Ticker)] -->|检查 active 任务| DB[(SQLite: cron_tasks)]
    Scheduler -->|触发执行| TaskDispatcher{Task Dispatcher}
    
    TaskDispatcher -->|task_type: crawler| CrawlerHandler[Web Crawler Handler]
    TaskDispatcher -->|task_type: rss| RSSHandler[RSS Reader Handler (预留)]
    TaskDispatcher -->|task_type: email_reader| EmailHandler[Email Reader Handler (预留)]
    
    CrawlerHandler -->|1. 获取网页| Network[HTTP GET Request]
    CrawlerHandler -->|2. 域名频率限制 RateLimit| RateLimiter[Rate Limiter (延迟等待)]
    CrawlerHandler -->|3. URL 正则匹配| Matcher{规则匹配器}
    
    Matcher -->|匹配成功| CustomParser[Custom Parse: CSS 选择器抽取]
    Matcher -->|匹配失败| GeneralParser[General Parse: go-readability 抽取]
    
    CustomParser -->|4. HTML to Markdown| MarkdownConverter[html-to-markdown 转换]
    GeneralParser -->|4. HTML to Markdown| MarkdownConverter
    
    MarkdownConverter -->|5. 创建笔记| NoteSystem[Note All 核心笔记存储 & 向量分片]
    
    TaskDispatcher -->|6. 执行完毕| LogWriter[写入 cron_task_logs 记录]
    LogWriter -->|7. 配置推送| Notifier[Notifier 发送引擎]
    
    Notifier -->|推送微信bot| WechatBot[微信Bot (WechatClient / Webhook)]
    Notifier -->|推送邮件| SmtpClient[SMTP 邮件服务器]
    Notifier -.->|读取推送设置| SettingDB[(SQLite: system_settings)]
```

---

## 2. Commands & APIs (API 路由设计)

定时任务与自定义抽取配置全部通过标准的 RESTful API 进行管理，后端暴露以下接口：

### 2.1 API 接口列表

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/cron-tasks` | GET | 获取定时任务列表（包含最后一次运行状态） |
| `/api/cron-tasks` | POST | 创建定时任务 |
| `/api/cron-tasks/:id` | PUT | 修改定时任务 |
| `/api/cron-tasks/:id` | DELETE| 删除定时任务 |
| `/api/cron-tasks/:id/toggle` | PUT | 快速启用 / 暂停任务 |
| `/api/cron-tasks/:id/run` | POST | 立即手动触发执行一次（异步执行，不影响前端） |
| `/api/cron-tasks/:id/logs` | GET | 获取指定任务的运行历史日志（支持分页） |
| `/api/extractor-rules` | GET | 获取自定义网页抽取正则规则列表 |
| `/api/extractor-rules` | POST | 新建自定义抽取规则 |
| `/api/extractor-rules/:id`| PUT | 修改自定义抽取规则 |
| `/api/extractor-rules/:id`| DELETE| 删除自定义抽取规则 |
| `/api/cron-settings` | GET | 获取推送全局配置（SMTP 邮件服务、Webhook 等，在数据库中持久化存储，密码自动脱敏） |
| `/api/cron-settings` | PUT | 更新推送全局配置 |

---

### 2.2 API 报文详细设计

#### 1. POST `/api/cron-tasks` - 创建定时任务
**Request**:
```json
{
  "name": "每日早报抓取",
  "task_type": "crawler",
  "schedule_type": "interval", 
  "schedule_value": "1440", // schedule_type 为 interval 时代表 1440 分钟 (24小时)
  "config": {
    "urls": ["https://news.ycombinator.com/", "https://sspai.com/post/8888"],
    "auto_extract": true,
    "custom_rules_only": false,
    "rate_limit_ms": 1500 // 域名请求频率限制 (默认 1500 毫秒)
  },
  "notification": {
    "push_wechat_bot": true,
    "push_email": true,
    "email_to": "admin@example.com"
  }
}
```
**Response**:
```json
{
  "code": 200,
  "message": "创建定时任务成功",
  "data": {
    "id": 1,
    "name": "每日早报抓取",
    "task_type": "crawler",
    "status": "paused",
    "schedule_type": "interval",
    "schedule_value": "1440",
    "last_run_time": null,
    "next_run_time": "2026-05-11T08:00:00+08:00"
  }
}
```

#### 2. GET `/api/cron-tasks/:id/logs` - 获取运行历史日志
**Response**:
```json
{
  "code": 200,
  "data": [
    {
      "id": 42,
      "task_id": 1,
      "start_time": "2026-05-10T08:00:00+08:00",
      "end_time": "2026-05-10T08:01:15+08:00",
      "status": "success",
      "result_summary": "抓取成功！解析网页数: 2, 成功生成新笔记数: 2 (《Y Combinator 早报》, 《少数派科技速递》)。微信和邮箱推送均已成功完成。",
      "error_message": ""
    }
  ],
  "total": 120
}
```

#### 3. GET `/api/cron-settings` - 获取全局推送配置
**Response**:
```json
{
  "code": 200,
  "data": {
    "smtp_host": "smtp.exmail.qq.com",
    "smtp_port": 465,
    "smtp_username": "notify@example.com",
    "smtp_password": "*************" // 脱敏返回，不可查看明文密码
  }
}
```

---

## 3. Project Structure (项目结构)

```
backend/
├── models/
│   ├── cron_task.go          # GORM 数据模型：CronTask, CronTaskLog, ExtractorRule, SystemSetting
│   └── note.go               # 修改 SetupDBWithFTS 注册新表
├── api/
│   └── cron_task.go          # Gin 接口控制器层：任务、日志、规则、设置
├── service/
│   ├── cron_scheduler.go     # 定时任务核心引擎：后台 goroutine 轮询、动态更新下次运行时间
│   ├── cron_dispatcher.go    # 任务分发与核心接口：TaskHandler 及动态注册机制
│   ├── crawler_handler.go    # 网页抓取处理器：通用抓取、正则匹配自定义 CSS 提取 (实现爬虫友好延迟)
│   └── notifier_service.go   # 消息推送服务：读取 SystemSetting 触发 SMTP / Webhook 推送
└── router/
    └── router.go            # 注册定时任务与规则路由

frontend/src/
├── api/
│   └── cronApi.js            # 定时任务、正则规则、全局通知配置 API 请求封装
├── components/
│   ├── CronSettingsTab.jsx   # 新增：SettingsModal 中的定时任务管理、推送设置、自定义正则提取界面
│   └── SettingsModal.jsx     # 修改：注册“定时任务 (Clock)” Tab 标签页并载入组件
```

---

## 4. Code Style & Technical Details (技术细节与代码范例)

### 4.1 数据库结构设计

使用 GORM 构建关系表结构：

```go
// backend/models/cron_task.go
package models

import (
	"time"

	"gorm.io/gorm"
)

// CronTask 定时任务核心表
type CronTask struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"deleted_at"`

	Name          string     `gorm:"size:128;not null" json:"name"`
	TaskType      string     `gorm:"size:64;not null" json:"task_type"`      // crawler (网页抓取), rss (RSS解析), email_reader (邮件拉取)
	Status        string     `gorm:"size:32;default:'paused';index" json:"status"` // active (启用), paused (暂停)
	
	// 调度方案
	ScheduleType  string     `gorm:"size:32;default:'interval'" json:"schedule_type"` // interval (分钟间隔), cron (Cron表达式)
	ScheduleValue string     `gorm:"size:128;not null" json:"schedule_value"`         // "1440" (分钟数) 或 "0 9 * * *" (每天早9点)
	
	// 任务具体配置（存储 JSON 字符串）
	// 例如：{"urls": ["http://..."], "auto_extract": true, "rate_limit_ms": 1500}
	Config        string     `gorm:"type:text" json:"config"` 

	// 推送设置（存储 JSON 字符串）
	// 例如：{"push_wechat_bot": true, "push_email": true, "email_to": "test@test.com"}
	Notification  string     `gorm:"type:text" json:"notification"`

	LastRunTime   *time.Time `json:"last_run_time"`
	NextRunTime   *time.Time `gorm:"index" json:"next_run_time"`
}

// CronTaskLog 定时任务运行日志表
type CronTaskLog struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	TaskID        uint      `gorm:"not null;index" json:"task_id"`
	StartTime     time.Time `json:"start_time"`
	EndTime       time.Time `json:"end_time"`
	Status        string    `gorm:"size:32;index" json:"status"`   // success (成功), failure (失败), running (运行中)
	ResultSummary string    `gorm:"type:text" json:"result_summary"` // 精简结果
	ErrorMessage  string    `gorm:"type:text" json:"error_message"`  // 详细的报错栈信息
}

// ExtractorRule 自定义网页 CSS 正则抽取配置表
type ExtractorRule struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"deleted_at"`

	Name            string `gorm:"size:128;not null" json:"name"`
	UrlPattern      string `gorm:"size:255;not null;uniqueIndex" json:"url_pattern"` // URL 匹配正则
	TitleSelector   string `gorm:"size:255;not null" json:"title_selector"`          // CSS选择器
	BodySelector    string `gorm:"size:255;not null" json:"body_selector"`           // CSS选择器
	AuthorSelector  string `gorm:"size:255" json:"author_selector"`                  // CSS选择器
	DateSelector    string `gorm:"size:255" json:"date_selector"`                    // CSS选择器
	ExcludeSelectors string `gorm:"type:text" json:"exclude_selectors"`               // 过滤干扰CSS
}

// SystemSetting 持久化配置项表
type SystemSetting struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	Key       string         `gorm:"size:128;uniqueIndex;not null" json:"key"` // 配置项唯一标识，如 "smtp_settings"、"webhook_settings"
	Value     string         `gorm:"type:text;not null" json:"value"`          // 存储加密或未加密的配置 JSON 字符串
}
```

---

### 4.2 Go 后台调度与引擎实现 (设计草案)

```go
// backend/service/cron_dispatcher.go
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"note_all_backend/models"
)

// TaskHandler 定义了可执行定时任务的标准接口
type TaskHandler interface {
	Execute(ctx context.Context, configStr string) (result string, err error)
}

var (
	handlers   = make(map[string]TaskHandler)
	handlersMu sync.RWMutex
)

// RegisterTaskHandler 注册任务处理器
func RegisterTaskHandler(taskType string, handler TaskHandler) {
	handlersMu.Lock()
	defer handlersMu.Unlock()
	handlers[taskType] = handler
}

// GetTaskHandler 获取处理器
func GetTaskHandler(taskType string) (TaskHandler, bool) {
	handlersMu.RLock()
	defer handlersMu.RUnlock()
	h, ok := handlers[taskType]
	return h, ok
}
```

---

### 4.3 网页精准抽取逻辑 (CSS & Regex 组合拳，已引入爬虫友好频率限制)

```go
// backend/service/web_crawler.go
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"

	"github.com/PuerkitoBio/goquery"
	"github.com/go-shiori/go-readability"
	"github.com/JohannesKaufmann/html-to-markdown"
)

type CrawlerConfig struct {
	Urls             []string `json:"urls"`
	AutoExtract      bool     `json:"auto_extract"`
	CustomRulesOnly  bool     `json:"custom_rules_only"`
	RateLimitMs      int      `json:"rate_limit_ms"` // 新增：单域名爬取间隔毫秒
}

type WebCrawlerTaskHandler struct{}

func (h *WebCrawlerTaskHandler) Execute(ctx context.Context, configStr string) (string, error) {
	var cfg CrawlerConfig
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		return "", fmt.Errorf("配置解析失败: %v", err)
	}

	// 限制最低爬取延迟为 500 毫秒，默认 1500 毫秒
	if cfg.RateLimitMs < 500 {
		cfg.RateLimitMs = 1500
	}

	successCount := 0
	failedCount := 0
	var notesCreated []string

	var rules []models.ExtractorRule
	global.DB.Find(&rules)

	client := &http.Client{Timeout: 30 * time.Second}

	for idx, rawURL := range cfg.Urls {
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" {
			continue
		}

		// 域名访问频率限制（非第一个 URL 抓取时自动延迟）
		if idx > 0 {
			time.Sleep(time.Duration(cfg.RateLimitMs) * time.Millisecond)
		}

		// 检查是否有自定义正则规则匹配
		var matchedRule *models.ExtractorRule
		for _, rule := range rules {
			re, err := regexp.Compile(rule.UrlPattern)
			if err == nil && re.MatchString(rawURL) {
				matchedRule = &rule
				break
			}
		}

		if cfg.CustomRulesOnly && matchedRule == nil {
			failedCount++
			continue
		}

		title, markdownContent, err := scrapePage(client, rawURL, matchedRule)
		if err != nil {
			failedCount++
			continue
		}

		err = createImportedNote(title, markdownContent, rawURL)
		if err == nil {
			successCount++
			notesCreated = append(notesCreated, fmt.Sprintf("《%s》", title))
		} else {
			failedCount++
		}
	}

	summary := fmt.Sprintf("抓取完成！成功抽取并入库 %d 篇笔记，失败 %d 篇。新导入笔记: %s", 
		successCount, failedCount, strings.Join(notesCreated, ", "))
	return summary, nil
}
```

---

## 5. Testing Strategy (测试策略)

### 5.1 后端测试用例 (Unit / Integration)

| 测试模块 | 测试内容 | 预期结果 |
|---------|---------|---------|
| 域名抓取延迟测试 | 配置有 3 个 URL，`rate_limit_ms` 设为 2000 | 检查任务执行时间差，第二个和第三个链接访问时间间隔必须大于或等于 2.0 秒 |
| 数据库配置项加解密 | 写入发件邮箱的授权密码到 `SystemSetting` 并读取 | 写入正常，读取后成功用于 SMTP 连接；向前端调用接口返回时被过滤为 `*************` 脱敏 |
| 网页自适应降级测试 | 请求一个通用 HTML，不带任何匹配正则规则 | 成功智能降级使用 `go-readability` 进行正文提纯并生成完美的 markdown |

---

## 6. Boundaries (限制与红线)

### 6.1 Always Do (必须遵循)
- ✅ 所有的网页抓取都必须限制连接与响应超时，最高超时不得超过 45 秒。
- ✅ 网页爬取必须实现可定制的**单域名访问频率控制 (Rate Limit)**，防止向目标域名集中轰炸请求导致反爬。
- ✅ 邮件、微信等全局推送配置必须统一通过 SQLite 数据库中的 `SystemSetting` 进行持久化，严禁明文保存在前端或以非脱敏形式下发。
- ✅ 写入抓取的 NoteItem 必须继承主表的 `SetupDBWithFTS` 触发器，即自动创建全文索引与向量段分片。

### 6.2 Ask First (需提前向用户确认)
- ⚠️ 网页抓取时是否主动支持 AI 提炼摘要？（规格说明书中默认开启：以 pending 入库，通过 Worker 队列异步自动提炼）。
- ⚠️ 是否需要对失败的任务日志进行自动清理？（建议：保留最近 1 个月的日志或前 500 条日志，超期自动逻辑删除）。

### 6.3 Never Do (严禁触碰)
- ❌ 严禁把明文 SMTP 密码和 Webhook 密钥直接保存在对外的 HTTP 返回报文中，在 GET 请求中必须作脱敏处理。
- ❌ 严禁直接引入未经评估的重量级第三方定时框架（如 `robfig/cron` 等）。使用纯 Go 常驻 Ticker 可以最大程度确保系统的极简与绝对控制力。

---

## 7. Success Criteria (验收成功标准)

1. **设置中心完美融合**: 可以在 `SettingsModal` 展开“定时任务”新 Tab。包含：任务状态列表、任务历史、规则录入、以及通知 SMTP/Webhook 在数据库级别的保存与展示面板。
2. **频率限制器生效**: 抓取多个链接时，爬虫依照配置的 `rate_limit_ms` 进行规整延时睡眠，行为友好。
3. **安全配置持久化**: SMTP 配置安全保存于 `system_settings` 中，后端发送模块自动拉取。

---

*文档版本: 1.1 | 更新日期: 2026-05-10*
