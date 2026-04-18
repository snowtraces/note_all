package service

import (
	"log"
	"strings"

	"note_all_backend/global"
)

// QueryRewriter 查询重写器
type QueryRewriter struct{}

// RewriteResult 重写结果
type RewriteResult struct {
	OriginalQuery  string   // 原始查询
	RewrittenQuery string   // 重写后的查询
	ExpandedTerms  []string // 扩展检索词
	FocusDocuments []uint   // 锁定文档范围
}

// NewQueryRewriter 创建查询重写器
func NewQueryRewriter() *QueryRewriter {
	return &QueryRewriter{}
}

// Rewrite 重写查询
func (qr *QueryRewriter) Rewrite(query string, history []ConversationMessage, context *SessionContext) RewriteResult {
	result := RewriteResult{
		OriginalQuery:  query,
		RewrittenQuery: query,
		FocusDocuments: context.ActiveDocuments,
	}

	// 如果没有上下文，不需要重写
	if len(context.ActiveDocuments) == 0 {
		return result
	}

	// 如果包含指代词，结合上下文重写
	if ContainsReference(query) {
		result = qr.rewriteWithReference(query, history, context)
	}

	// 如果是澄清请求，直接锁定文档
	if len(history) > 0 {
		lastMsg := history[len(history)-1]
		if lastMsg.Role == "assistant" && len(lastMsg.References) > 0 {
			// 继承上一轮的引用文档
			result.FocusDocuments = lastMsg.References
		}
	}

	log.Printf("[QueryRewriter] 重写: %s -> %s, FocusDocs: %v",
		query, result.RewrittenQuery, result.FocusDocuments)

	return result
}

// rewriteWithReference 结合指代词重写查询
func (qr *QueryRewriter) rewriteWithReference(query string, history []ConversationMessage, context *SessionContext) RewriteResult {
	result := RewriteResult{
		OriginalQuery:  query,
		RewrittenQuery: query,
		FocusDocuments: context.ActiveDocuments,
	}

	// 获取当前话题/文档标题
	topic := context.ActiveTopic
	if topic == "" && len(context.ActiveDocuments) > 0 {
		// 从数据库获取文档标题
		topic = qr.getDocumentTitle(context.ActiveDocuments[0])
	}

	// 替换指代词为具体话题
	for _, refWord := range referenceWords {
		if strings.Contains(query, refWord) {
			// 替换第一个指代词
			result.RewrittenQuery = strings.Replace(query, refWord, topic, 1)
			log.Printf("[QueryRewriter] 指代词替换: %s -> %s (使用话题: %s)",
				query, result.RewrittenQuery, topic)
			break
		}
	}

	// 扩展检索词（结合话题）
	result.ExpandedTerms = qr.expandTerms(result.RewrittenQuery, topic)

	return result
}

// getDocumentTitle 获取文档标题
func (qr *QueryRewriter) getDocumentTitle(docID uint) string {
	// 从数据库获取标题
	type docTitle struct {
		OriginalName string
	}
	var title docTitle
	global.DB.Table("note_items").
		Select("original_name").
		Where("id = ? AND deleted_at IS NULL", docID).
		First(&title)

	// 清理标题（去除文件扩展名）
	name := title.OriginalName
	if name == "" {
		return "文档"
	}

	// 移除常见扩展名
	exts := []string{".pdf", ".txt", ".md", ".doc", ".docx", ".png", ".jpg"}
	for _, ext := range exts {
		name = strings.TrimSuffix(name, ext)
	}

	// 截断过长标题
	if len([]rune(name)) > 20 {
		name = string([]rune(name)[:20])
	}

	return name
}

// expandTerms 扩展检索词
func (qr *QueryRewriter) expandTerms(query string, topic string) []string {
	terms := []string{query}

	// 如果话题有意义，添加话题作为扩展词
	if topic != "" && topic != "文档" {
		terms = append(terms, topic)
	}

	// 使用同义词扩展
	synonyms := QueryRewrite(query)
	for _, syn := range synonyms {
		if syn != query && !contains(terms, syn) {
			terms = append(terms, syn)
		}
	}

	return terms
}

// FocusOnly 是否仅使用关注文档（不需要检索）
func (qr *QueryRewriter) FocusOnly(result RewriteResult) bool {
	// 如果有锁定文档且查询不需要新信息
	clarifyMarkers := []string{"什么意思", "具体", "解释", "详细", "展开"}
	for _, marker := range clarifyMarkers {
		if strings.Contains(strings.ToLower(result.OriginalQuery), marker) {
			return true
		}
	}

	// 简短追问（可能是澄清）
	if len(result.OriginalQuery) < 15 && len(result.FocusDocuments) > 0 {
		return true
	}

	return false
}

// contains 辅助函数：检查字符串是否在列表中
func contains(list []string, item string) bool {
	for _, s := range list {
		if s == item {
			return true
		}
	}
	return false
}