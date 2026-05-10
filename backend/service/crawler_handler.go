package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/utils"

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

// compiledRule 预编译的正则匹配规则缓存
type compiledRule struct {
	rule *models.ExtractorRule
	re   *regexp.Regexp
}

// WebCrawlerTaskHandler 网页抓取定时任务处理器
type WebCrawlerTaskHandler struct{}

func init() {
	RegisterTaskHandler("crawler", &WebCrawlerTaskHandler{})
}

// Execute 接口实现
func (h *WebCrawlerTaskHandler) Execute(ctx context.Context, configStr string) (string, error) {
	var cfg CrawlerConfig
	if err := json.Unmarshal([]byte(configStr), &cfg); err != nil {
		return "", fmt.Errorf("定时任务网页抓取配置解析失败: %v", err)
	}

	if cfg.RateLimitMs < 500 {
		cfg.RateLimitMs = 1500
	}

	// URL 去重 (避免同一批次重复抓取)
	seenUrls := make(map[string]bool)
	var uniqueUrls []string
	for _, u := range cfg.Urls {
		u = strings.TrimSpace(u)
		if u != "" && !seenUrls[u] {
			seenUrls[u] = true
			uniqueUrls = append(uniqueUrls, u)
		}
	}
	cfg.Urls = uniqueUrls

	var rules []models.ExtractorRule
	if err := global.DB.Find(&rules).Error; err != nil {
		log.Printf("[CrawlerTask] 读取自定义网页匹配规则列表失败: %v", err)
	}

	// 预编译所有正则规则，避免循环中重复编译
	var compiledRules []compiledRule
	for i := range rules {
		re, err := regexp.Compile(rules[i].UrlPattern)
		if err == nil {
			compiledRules = append(compiledRules, compiledRule{rule: &rules[i], re: re})
		}
	}

	successCount := 0
	failedCount := 0
	var createdTitles []string

	client := &http.Client{Timeout: 45 * time.Second}

	for idx, targetUrl := range cfg.Urls {
		targetUrl = strings.TrimSpace(targetUrl)
		if targetUrl == "" {
			continue
		}

		// SSRF 安全验证
		if err := utils.IsSafeURL(targetUrl); err != nil {
			log.Printf("[CrawlerTask] URL 安全校验失败 (%s): %v", targetUrl, err)
			failedCount++
			continue
		}

		// 单域名请求频率友好控制
		if idx > 0 {
			select {
			case <-ctx.Done():
				return fmt.Sprintf("抓取任务因上下文取消而中断。成功: %d, 失败: %d", successCount, failedCount), ctx.Err()
			case <-time.After(time.Duration(cfg.RateLimitMs) * time.Millisecond):
			}
		}

		// 检测该 URL 能否匹配到任何自定义正则抽取规则 (使用预编译缓存)
		var matchedRule *models.ExtractorRule
		for _, cr := range compiledRules {
			if cr.re.MatchString(targetUrl) {
				matchedRule = cr.rule
				break
			}
		}

		if matchedRule != nil {
			if matchedRule.RuleType == "list" {
				log.Printf("[CrawlerTask] 命中列表提取规则 [%s], 启动列表解析: %s", matchedRule.Name, targetUrl)
				items, err := scrapeListWithCustomRule(client, targetUrl, matchedRule)
				if err != nil {
					log.Printf("[CrawlerTask] 列表提取失败: %v", err)
					failedCount++
					continue
				}

				taskName, _ := ctx.Value(taskNameKey).(string)
				if taskName == "" {
					taskName = matchedRule.Name
				}

				var sb strings.Builder
				sb.WriteString(fmt.Sprintf("# %s (%s)\n\n", taskName, time.Now().Format("2006-01-02 15:04")))
				sb.WriteString(fmt.Sprintf("> 来源页面: [%s](%s) | 抓取时间: %s | 共 %d 条记录\n\n---\n\n",
					targetUrl, targetUrl, time.Now().Format("2006-01-02 15:04:05"), len(items)))

				for _, item := range items {
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
				log.Printf("[CrawlerTask] 命中自定义规则 [%s], 启动精准选择器抽取: %s", matchedRule.Name, targetUrl)
				title, markdownContent, err := scrapeWithCustomRule(client, targetUrl, matchedRule)
				if err != nil {
					log.Printf("[CrawlerTask] 精准选择器抽取失败: %v", err)
					failedCount++
					continue
				}

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
			if cfg.CustomRulesOnly {
				log.Printf("[CrawlerTask] 启用了仅使用自定义规则提取，跳过网页: %s", targetUrl)
				failedCount++
				continue
			}

			log.Printf("[CrawlerTask] 未匹配到正则规则, 降级至通用抽取: %s", targetUrl)
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

func scrapeWithCustomRule(client *http.Client, targetUrl string, rule *models.ExtractorRule) (string, string, error) {
	if err := utils.IsSafeURL(targetUrl); err != nil {
		return "", "", fmt.Errorf("URL 安全校验失败: %v", err)
	}
	req, err := http.NewRequest("GET", targetUrl, nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 NoteAllCrawler/1.1")

	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("HTTP 响应异常: %d", resp.StatusCode)
	}

	// 限制响应体大小 (10MB)
	limitedBody := io.LimitReader(resp.Body, 10*1024*1024)
	doc, err := goquery.NewDocumentFromReader(limitedBody)
	if err != nil {
		return "", "", fmt.Errorf("解析 HTML DOM 失败: %v", err)
	}

	if rule.ExcludeSelectors != "" {
		excludes := strings.Split(rule.ExcludeSelectors, ",")
		for _, excl := range excludes {
			excl = strings.TrimSpace(excl)
			if excl != "" {
				doc.Find(excl).Remove()
			}
		}
	}

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

	bodyHtml, err := doc.Find(rule.BodySelector).First().Html()
	if err != nil || bodyHtml == "" {
		return "", "", fmt.Errorf("通过选择器 [%s] 找不到有效的正文内容", rule.BodySelector)
	}

	converter := md.NewConverter("", true, nil)
	markdown, err := converter.ConvertString(bodyHtml)
	if err != nil {
		return "", "", fmt.Errorf("HTML 转换为 Markdown 失败: %v", err)
	}

	finalMarkdown := fmt.Sprintf("# %s\n\n> 匹配自定义规则: **%s** | 原链接: [%s](%s)\n\n---\n\n%s",
		title, rule.Name, targetUrl, targetUrl, markdown)

	return title, finalMarkdown, nil
}

func saveScrapedNote(title, markdownContent, targetUrl string) error {
	// 防止重复入库 - 同 URL 24小时内不重复创建
	var existing models.NoteItem
	cutoff := time.Now().Add(-24 * time.Hour)
	if global.DB.Where("original_url = ? AND created_at > ?", targetUrl, cutoff).First(&existing).Error == nil {
		log.Printf("[CrawlerTask] 该 URL 24小时内已入库 (ID:%d)，跳过重复创建: %s", existing.ID, targetUrl)
		return nil
	}

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
		Status:       "pending",
	}

	if err := global.DB.Create(&note).Error; err != nil {
		return fmt.Errorf("写入数据库 NoteItem 失败: %v", err)
	}

	nID := note.ID
	global.WorkerChan <- func() {
		log.Printf("[CrawlerTask] 开始为精准抓取成果 (ID:%d) 唤起 RAG 与大模型摘要任务...", nID)
		performFullAnalysis(nID, 0)
	}

	return nil
}

type ScrapedItem struct {
	Title   string
	Content string
	Link    string
}

func scrapeListWithCustomRule(client *http.Client, targetUrl string, rule *models.ExtractorRule) ([]ScrapedItem, error) {
	if err := utils.IsSafeURL(targetUrl); err != nil {
		return nil, fmt.Errorf("URL 安全校验失败: %v", err)
	}
	req, err := http.NewRequest("GET", targetUrl, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 NoteAllCrawler/1.1")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP 响应异常: %d", resp.StatusCode)
	}

	limitedBody := io.LimitReader(resp.Body, 10*1024*1024)
	doc, err := goquery.NewDocumentFromReader(limitedBody)
	if err != nil {
		return nil, fmt.Errorf("解析 HTML DOM 失败: %v", err)
	}

	var results []ScrapedItem

	doc.Find(rule.ItemSelector).Each(func(i int, s *goquery.Selection) {
		if s.ParentsFiltered(rule.ItemSelector).Length() > 0 {
			return
		}

		title := ""
		if rule.TitleSelector != "" {
			title = strings.TrimSpace(s.Find(rule.TitleSelector).First().Text())
		}
		if title == "" {
			return
		}

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

		dateStr := ""
		if rule.DateSelector != "" {
			dateStr = strings.TrimSpace(s.Find(rule.DateSelector).First().Text())
		}

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

func TestExtractorRule(targetUrl string, rule *models.ExtractorRule) (string, string, error) {
	if err := utils.IsSafeURL(targetUrl); err != nil {
		return "", "", fmt.Errorf("URL 安全校验失败: %v", err)
	}
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
		sb.WriteString(fmt.Sprintf("### 列表规则测试成功！共提取到 %d 条新闻项\n\n", len(items)))
		for idx, item := range items {
			sb.WriteString(fmt.Sprintf("#### [%d] %s\n", idx+1, item.Title))
			sb.WriteString(fmt.Sprintf("- **原文链接**: %s\n", item.Link))
			sb.WriteString(fmt.Sprintf("- **提纯内容**:\n%s\n\n---\n\n", item.Content))
		}
		return fmt.Sprintf("列表匹配测试成果 (%d项)", len(items)), sb.String(), nil
	}
	return scrapeWithCustomRule(client, targetUrl, rule)
}