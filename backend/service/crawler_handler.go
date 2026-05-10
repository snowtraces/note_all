package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"

	md "github.com/JohannesKaufmann/html-to-markdown"
	"github.com/PuerkitoBio/goquery"
)

// CrawlerConfig 网页抓取任务配置
type CrawlerConfig struct {
	Urls            []string `json:"urls"`
	AutoExtract     bool     `json:"auto_extract"`
	CustomRulesOnly bool     `json:"custom_rules_only"`
	RateLimitMs     int      `json:"rate_limit_ms"`
}

// WebCrawlerTaskHandler 网页抓取定时任务处理器
type WebCrawlerTaskHandler struct{}

func init() {
	// 注册处理器
	RegisterTaskHandler("crawler", &WebCrawlerTaskHandler{})
}

// Execute 接口实现
func (h *WebCrawlerTaskHandler) Execute(ctx context.Context, configStr string) (string, error) {
	var cfg CrawlerConfig
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		return "", fmt.Errorf("定时任务网页抓取配置解析失败: %v", err)
	}

	if cfg.RateLimitMs < 500 {
		cfg.RateLimitMs = 1500 // 默认频率限制为 1.5 秒
	}

	var rules []models.ExtractorRule
	if err := global.DB.Find(&rules).Error; err != nil {
		log.Printf("[CrawlerTask] 读取自定义网页匹配规则列表失败: %v", err)
	}

	successCount := 0
	failedCount := 0
	var createdTitles []string

	client := &http.Client{Timeout: 30 * time.Second}

	for idx, targetUrl := range cfg.Urls {
		targetUrl = strings.TrimSpace(targetUrl)
		if targetUrl == "" {
			continue
		}

		// 1. 进行单域名请求频率友好控制 (防高频请求遭封禁)
		if idx > 0 {
			select {
			case <-ctx.Done():
				return fmt.Sprintf("抓取任务因上下文取消而中断。成功: %d, 失败: %d", successCount, failedCount), ctx.Err()
			case <-time.After(time.Duration(cfg.RateLimitMs) * time.Millisecond):
			}
		}

		// 2. 检测该 URL 能否匹配到任何自定义正则抽取规则
		var matchedRule *models.ExtractorRule
		for _, r := range rules {
			re, err := regexp.Compile(r.UrlPattern)
			if err == nil && re.MatchString(targetUrl) {
				matchedRule = &r
				break
			}
		}

		// 3. 执行抽取流程
		if matchedRule != nil {
			if matchedRule.RuleType == "list" {
				// ==================== 列表直接匹配批量提取 ====================
				log.Printf("[CrawlerTask] 命中列表提取规则 [%s], 启动列表解析: %s", matchedRule.Name, targetUrl)
				items, err := scrapeListWithCustomRule(client, targetUrl, matchedRule)
				if err != nil {
					log.Printf("[CrawlerTask] 列表提取失败: %v", err)
					failedCount++
					continue
				}

				// 提取上下文中的任务名称，如果没有则回退到匹配的提取规则名称
				taskName, _ := ctx.Value("task_name").(string)
				if taskName == "" {
					taskName = matchedRule.Name
				}

				// 将所有子项内容直接拼接为一个完整的 Markdown 文档
				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("# %s (%s)\n\n", taskName, time.Now().Format("2006-01-02 15:04")))
				sb.WriteString(fmt.Sprintf("> 💡 来源页面: [%s](%s) | 抓取时间: %s | 共 %d 条记录\n\n---\n\n",
					targetUrl, targetUrl, time.Now().Format("2006-01-02 15:04:05"), len(items)))

				for _, item := range items {
					// 替换第一个 # 标题为 ##，使得合并文档的目录结构更清晰
					itemContent := strings.Replace(item.Content, "# ", "## ", 1)
					sb.WriteString(itemContent)
					sb.WriteString("\n\n---\n\n")
				}

				listTitle := fmt.Sprintf("列表聚合：%s (%s)", taskName, time.Now().Format("01-02 15:04"))
				err = saveScrapedNote(listTitle, sb.String(), targetUrl)
				if err != nil {
					log.Printf("[CrawlerTask] 保存列表聚合失败: %v", err)
					failedCount++
				} else {
					successCount++
					createdTitles = append(createdTitles, fmt.Sprintf("《%s》", listTitle))
				}
			} else {
				// ==================== 自定义 CSS 匹配详情精准提取 ====================
				log.Printf("[CrawlerTask] 命中自定义规则 [%s], 启动精准选择器抽取: %s", matchedRule.Name, targetUrl)
				title, markdownContent, err := scrapeWithCustomRule(client, targetUrl, matchedRule)
				if err != nil {
					log.Printf("[CrawlerTask] 精准选择器抽取失败: %v", err)
					failedCount++
					continue
				}

				// 保存入库
				err = saveScrapedNote(title, markdownContent, targetUrl)
				if err != nil {
					log.Printf("[CrawlerTask] 保存精准抽取笔记失败: %v", err)
					failedCount++
				} else {
					successCount++
					createdTitles = append(createdTitles, fmt.Sprintf("《%s》", title))
				}
			}
		} else {
			// ==================== 通用抓取 Fallback ====================
			if cfg.CustomRulesOnly {
				log.Printf("[CrawlerTask] 启用了“仅使用自定义规则提取”，未命中匹配正则，跳过网页: %s", targetUrl)
				failedCount++
				continue
			}

			log.Printf("[CrawlerTask] 未匹配到正则规则, 降级至通用抽取 (Jina/Readability): %s", targetUrl)
			// 直接复用系统中审计好的 CreateNoteFromText，它会自动触发 FetchURLContent
			note, err := CreateNoteFromText(targetUrl, "")
			if err != nil {
				log.Printf("[CrawlerTask] 通用抽取网页失败: %v", err)
				failedCount++
			} else {
				successCount++
				createdTitles = append(createdTitles, fmt.Sprintf("《%s》", note.OriginalName))
			}
		}
	}

	summary := fmt.Sprintf("成功抓取 %d 个网页，失败 %d 个。成功生成新笔记: %s",
		successCount, failedCount, strings.Join(createdTitles, ", "))
	return summary, nil
}

// 使用自定义规则进行拉取并转换
func scrapeWithCustomRule(client *http.Client, targetUrl string, rule *models.ExtractorRule) (string, string, error) {
	req, err := http.NewRequest("GET", targetUrl, nil)
	if err != nil {
		return "", "", err
	}
	// 伪装标准 User-Agent，避免直接被爬虫过滤器封杀
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NoteAllCrawler/1.1")

	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("HTTP 响应异常: %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return "", "", fmt.Errorf("解析 HTML DOM 失败: %v", err)
	}

	// 1. 净化 DOM：剔除干扰的各种不相干节点
	if rule.ExcludeSelectors != "" {
		excludes := strings.Split(rule.ExcludeSelectors, ",")
		for _, excl := range excludes {
			excl = strings.TrimSpace(excl)
			if excl != "" {
				doc.Find(excl).Remove()
			}
		}
	}

	// 2. 提取标题
	title := ""
	if rule.TitleSelector != "" {
		title = strings.TrimSpace(doc.Find(rule.TitleSelector).First().Text())
	}
	if title == "" {
		title = strings.TrimSpace(doc.Find("title").First().Text())
	}
	if title == "" {
		u, _ := url.Parse(targetUrl)
		if u != nil {
			title = fmt.Sprintf("网页快照 (%s)", u.Host)
		} else {
			title = "未命名自定义网页抽取"
		}
	}

	// 3. 提取主体正文并转换
	bodyHtml, err := doc.Find(rule.BodySelector).First().Html()
	if err != nil || bodyHtml == "" {
		return "", "", fmt.Errorf("通过选择器 [%s] 找不到有效的正文内容", rule.BodySelector)
	}

	converter := md.NewConverter("", true, nil)
	markdown, err := converter.ConvertString(bodyHtml)
	if err != nil {
		return "", "", fmt.Errorf("HTML 转换为 Markdown 失败: %v", err)
	}

	// 4. 追加元数据头部，保持文章可溯源性
	finalMarkdown := fmt.Sprintf("# %s\n\n> 💡 匹配自定义规则: **%s** | 原链接: [%s](%s)\n\n---\n\n%s",
		title, rule.Name, targetUrl, targetUrl, markdown)

	return title, finalMarkdown, nil
}

// 封装自定义提取好的 Markdown 保存入库
func saveScrapedNote(title, markdownContent, targetUrl string) error {
	// 保存内容到底层块存储 (snow_storage)
	secureName := fmt.Sprintf("crawler_%d_snapshot.md", time.Now().UnixNano())
	storageID, err := global.Storage.Save(secureName, strings.NewReader(markdownContent))
	if err != nil {
		return fmt.Errorf("底层存储块写入失败: %v", err)
	}

	note := models.NoteItem{
		OriginalName: title,
		StorageID:    storageID,
		FileType:     "text/markdown",
		FileSize:     int64(len(markdownContent)),
		OcrText:      markdownContent,
		OriginalUrl:  targetUrl,
		Status:       "pending", // 交由主 Worker 进行异步 LLM 摘要及打标、RAG切片等
	}

	if err := global.DB.Create(&note).Error; err != nil {
		return fmt.Errorf("写入数据库 NoteItem 失败: %v", err)
	}

	// 异步唤起全链路 AI 分析与向量分片
	nID := note.ID
	global.WorkerChan <- func() {
		log.Printf("[CrawlerTask] 开始为精准抓取成果 (ID:%d) 唤起 RAG 与大模型摘要任务...\n", nID)
		performFullAnalysis(nID, 0)
	}

	return nil
}

type ScrapedItem struct {
	Title   string
	Content string
	Link    string
}

// scrapeListWithCustomRule 支持列表直接批量采集提取
func scrapeListWithCustomRule(client *http.Client, targetUrl string, rule *models.ExtractorRule) ([]ScrapedItem, error) {
	req, err := http.NewRequest("GET", targetUrl, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 NoteAllCrawler/1.1")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP 响应异常: %d", resp.StatusCode)
	}

	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("解析 HTML DOM 失败: %v", err)
	}

	var results []ScrapedItem

	doc.Find(rule.ItemSelector).Each(func(i int, s *goquery.Selection) {
		// 过滤嵌套子项，避免递归查询子项
		if s.ParentsFiltered(rule.ItemSelector).Length() > 0 {
			return
		}

		// 1. 提取标题
		title := ""
		if rule.TitleSelector != "" {
			title = strings.TrimSpace(s.Find(rule.TitleSelector).First().Text())
		}
		if title == "" {
			return
		}

		// 2. 提取链接
		link := ""
		if rule.LinkSelector != "" {
			l, exists := s.Find(rule.LinkSelector).First().Attr("href")
			if exists {
				link = strings.TrimSpace(l)
				if !strings.HasPrefix(link, "http") {
					base, err := url.Parse(targetUrl)
					if err == nil {
						u, err := base.Parse(link)
						if err == nil {
							link = u.String()
						}
					}
				}
			}
		}
		if link == "" {
			link = targetUrl
		}

		// 3. 提取内容摘要
		content := ""
		if rule.BodySelector != "" {
			sel := s.Find(rule.BodySelector).First()
			tVal, tExists := sel.Attr("title")
			if tExists && strings.TrimSpace(tVal) != "" {
				content = strings.TrimSpace(tVal)
			} else {
				content = strings.TrimSpace(sel.Text())
			}
		}
		if content == "" {
			content = title
		}

		// 4. 提取发布时间
		dateStr := ""
		if rule.DateSelector != "" {
			dateStr = strings.TrimSpace(s.Find(rule.DateSelector).First().Text())
		}

		// 为列表项组装出格式化后的正文
		formattedMarkdown := fmt.Sprintf("# %s\n\n[%s](%s) | %s\n\n---\n\n%s",
			title, link, link, dateStr, content)

		results = append(results, ScrapedItem{
			Title:   title,
			Content: formattedMarkdown,
			Link:    link,
		})
	})

	return results, nil
}

// TestExtractorRule 测试网页自定义匹配规则的抽取成效
func TestExtractorRule(targetUrl string, rule *models.ExtractorRule) (string, string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	if rule.RuleType == "list" {
		items, err := scrapeListWithCustomRule(client, targetUrl, rule)
		if err != nil {
			return "", "", err
		}
		if len(items) == 0 {
			return "列表测试结果 (未抓取到任何项)", "未提取到任何满足条件的项，请检查您的 item_selector 是否正确。", nil
		}
		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("### ⚡ 列表规则测试成功！共提取到 %d 条新闻项\n\n", len(items)))
		for idx, item := range items {
			sb.WriteString(fmt.Sprintf("#### [%d] %s\n", idx+1, item.Title))
			sb.WriteString(fmt.Sprintf("- **原文链接**: %s\n", item.Link))
			sb.WriteString(fmt.Sprintf("- **提纯内容**:\n%s\n\n---\n\n", item.Content))
		}
		return fmt.Sprintf("列表匹配测试成果 (%d项)", len(items)), sb.String(), nil
	}
	return scrapeWithCustomRule(client, targetUrl, rule)
}
