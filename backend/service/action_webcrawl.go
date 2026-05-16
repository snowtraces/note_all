package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/utils"
)

// WebCrawlActionHandler 网页爬虫动作处理器
type WebCrawlActionHandler struct{}

func init() {
	RegisterActionHandler("web_crawl", &WebCrawlActionHandler{})
}

// WebCrawlInput 网页爬虫输入配置
type WebCrawlInput struct {
	Urls        []string `json:"urls"`
	RateLimitMs int      `json:"rate_limit_ms"`
}

// Execute 执行网页爬取，返回合并的 Markdown 内容
func (h *WebCrawlActionHandler) Execute(ctx context.Context, input string, config map[string]interface{}) (string, error) {
	// 解析输入 (固定输入的 config JSON)
	var cfg WebCrawlInput
	if err := json.Unmarshal([]byte(input), &cfg); err != nil {
		return "", fmt.Errorf("网页爬虫输入解析失败: %v", err)
	}

	if len(cfg.Urls) == 0 {
		return "", fmt.Errorf("URL 列表为空")
	}

	if cfg.RateLimitMs < 500 {
		cfg.RateLimitMs = 1500
	}

	// URL 去重
	seen := make(map[string]bool)
	var uniqueUrls []string
	for _, u := range cfg.Urls {
		u = strings.TrimSpace(u)
		if u != "" && !seen[u] {
			seen[u] = true
			uniqueUrls = append(uniqueUrls, u)
		}
	}

	// 加载抽取规则
	var rules []models.ExtractorRule
	if err := global.DB.Find(&rules).Error; err != nil {
		log.Printf("[WebCrawlAction] 读取抽取规则失败: %v", err)
	}

	var compiledRules []compiledRule
	for i := range rules {
		re, err := regexp.Compile(rules[i].UrlPattern)
		if err == nil {
			compiledRules = append(compiledRules, compiledRule{rule: &rules[i], re: re})
		}
	}

	client := &http.Client{Timeout: 45 * time.Second}
	var allContent []string
	successCount := 0
	failedCount := 0

	for idx, targetUrl := range uniqueUrls {
		// SSRF 安全验证
		if err := utils.IsSafeURL(targetUrl); err != nil {
			log.Printf("[WebCrawlAction] URL 安全校验失败 (%s): %v", targetUrl, err)
			failedCount++
			continue
		}

		// 频率控制
		if idx > 0 {
			select {
			case <-ctx.Done():
				return strings.Join(allContent, "\n\n---\n\n"), ctx.Err()
			case <-time.After(time.Duration(cfg.RateLimitMs) * time.Millisecond):
			}
		}

		// 匹配抽取规则
		var matchedRule *models.ExtractorRule
		for _, cr := range compiledRules {
			if cr.re.MatchString(targetUrl) {
				matchedRule = cr.rule
				break
			}
		}

		if matchedRule != nil {
			if matchedRule.RuleType == "list" {
				items, err := scrapeListWithCustomRule(client, targetUrl, matchedRule)
				if err != nil {
					log.Printf("[WebCrawlAction] 列表提取失败 (%s): %v", targetUrl, err)
					failedCount++
					continue
				}
				var sb strings.Builder
				for _, item := range items {
					sb.WriteString(item.Content)
					sb.WriteString("\n\n---\n\n")
				}
				allContent = append(allContent, sb.String())
				successCount++
			} else {
				title, markdown, err := scrapeWithCustomRule(client, targetUrl, matchedRule)
				if err != nil {
					log.Printf("[WebCrawlAction] 精准提取失败 (%s): %v", targetUrl, err)
					failedCount++
					continue
				}
				_ = title
				allContent = append(allContent, markdown)
				successCount++
			}
		} else {
			// 通用提取：使用 Jina Reader / Readability
			note, err := CreateNoteFromText(targetUrl, "")
			if err != nil {
				log.Printf("[WebCrawlAction] 通用提取失败 (%s): %v", targetUrl, err)
				failedCount++
				continue
			}
			// 读取提取后的内容
			content := note.OcrText
			if content == "" {
				content = fmt.Sprintf("# %s\n\n来源: %s", note.OriginalName, targetUrl)
			}
			allContent = append(allContent, content)
			successCount++
		}
	}

	if len(allContent) == 0 {
		return "", fmt.Errorf("所有 URL 抓取均失败 (共 %d 个)", failedCount)
	}

	output := strings.Join(allContent, "\n\n---\n\n")
	log.Printf("[WebCrawlAction] 完成: 成功 %d, 失败 %d, 输出长度 %d", successCount, failedCount, len(output))
	return output, nil
}
