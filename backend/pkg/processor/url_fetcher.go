package processor

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	md "github.com/JohannesKaufmann/html-to-markdown"
	"github.com/go-shiori/go-readability"
)

// IsURL checks if a given string is a valid HTTP/HTTPS URL
func IsURL(text string) bool {
	u, err := url.ParseRequestURI(strings.TrimSpace(text))
	if err != nil {
		return false
	}
	// Basic check: must have host and be http/https
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// FetchURLContent 智能提取页面正文。返回 title, 拼接好头部声明的 markdown, 有效正文长度, 以及 err
func FetchURLContent(targetUrl string) (title string, markdownText string, pureContentLen int, err error) {
	targetUrl = strings.TrimSpace(targetUrl)

	// 引擎1：尝试通过 Jina.ai 云端提取
	title, markdownText, pureContentLen, err = fetchWithJina(targetUrl)
	if err == nil && markdownText != "" {
		finalMarkdown := fmt.Sprintf("# %s\n\n> 💡 源解析 (Reader Mode): [%s](%s)\n\n---\n\n%s", title, targetUrl, targetUrl, markdownText)
		return title, finalMarkdown, pureContentLen, nil
	}

	log.Printf("[URL_FETCHER] Jina 引擎云端提取失败 (原因: %v)，正在降级至原生 Readability 解析...", err)

	// 引擎2：本地物理降级提取
	title, markdownText, pureContentLen, err = fetchWithReadability(targetUrl)
	if err != nil {
		return "", "", 0, fmt.Errorf("双引擎提取全部失败，放弃抓取: %v", err)
	}

	finalMarkdown := fmt.Sprintf("# %s\n\n> 💡 源解析 (Readability): [%s](%s)\n\n---\n\n%s", title, targetUrl, targetUrl, markdownText)
	return title, finalMarkdown, pureContentLen, nil
}

func fetchWithJina(targetUrl string) (title string, markdownText string, pureContentLen int, err error) {
	readerUrl := "https://r.jina.ai/" + targetUrl

	req, err := http.NewRequest("GET", readerUrl, nil)
	if err != nil {
		return "", "", 0, err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("X-Return-Format", "markdown")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", "", 0, fmt.Errorf("状态异常 %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", 0, err
	}

	rawMarkdown := string(bodyBytes)

	title = ""
	lines := strings.Split(rawMarkdown, "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "Title: ") {
			title = strings.TrimSpace(strings.TrimPrefix(line, "Title: "))
			break
		}
	}
	if title == "" {
		title = "云提取网页摘录"
	}

	return title, rawMarkdown, len([]rune(rawMarkdown)), nil
}

func fetchWithReadability(targetUrl string) (title string, markdownText string, pureContentLen int, err error) {
	article, err := readability.FromURL(targetUrl, 15*time.Second)
	if err != nil {
		return "", "", 0, err
	}

	title = article.Title
	if title == "" {
		u, _ := url.Parse(targetUrl)
		if u != nil && u.Host != "" {
			title = fmt.Sprintf("🌍 来自 %s 的安全链接", u.Host)
		} else {
			title = "未命名的网页摘录"
		}
	}

	if article.Content == "" && article.TextContent == "" {
		return title, "无法有效地从 HTML 净化该网页正文内容。\n\n> 站点可能开启了强反爬保护。请尝试直接在网页端复制内容。", 0, nil
	}

	converter := md.NewConverter("", true, nil)
	markdown, err := converter.ConvertString(article.Content)
	if err != nil {
		markdownText = article.TextContent
	} else {
		markdownText = markdown
	}

	pureContentLen = len([]rune(article.TextContent))

	// 专门针对知乎的反爬盾残骸进行更友好的提示隔离
	if strings.Contains(markdownText, "知乎，让每一次点击都充满意义") || strings.Contains(markdownText, "安全验证") {
		markdownText = "> 🔒 该站点触发了高级反爬虫人机验证（如知乎护盾等），底层提取器已被 WAF 拦截。\n> \n> 💡 **请直接点击上方【直达源网址】在浏览器中查阅**，或在 App 内直接复制局部关键段落收集。"
		pureContentLen = 0 // 对于无效防爬废话，我们主动判定其实际可用内容极少
	}

	return title, markdownText, pureContentLen, nil
}
