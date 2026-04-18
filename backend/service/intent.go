package service

import (
	"log"
	"regexp"
	"strings"
)

// IntentType 意图类型
type IntentType string

const (
	IntentNewTopic   IntentType = "new_topic"    // 新话题
	IntentFollowUp   IntentType = "follow_up"    // 追问（需上下文）
	IntentClarify    IntentType = "clarify"      // 澄清请求
	IntentSwitch     IntentType = "switch"       // 切换话题
	IntentMultiStep  IntentType = "multi_step"   // 多步任务
	IntentSearch     IntentType = "search"       // 检索
	IntentSummarize  IntentType = "summarize"    // 总结
	IntentCompare    IntentType = "compare"      // 对比分析
	IntentGenerate   IntentType = "generate"     // 生成内容
	IntentRecord     IntentType = "record"       // 记录/备忘
)

// IntentResult 意图分析结果
type IntentResult struct {
	Type       IntentType
	Reference  string     // 指代对象（如"它"、"上面那个"）
	SubTasks   []SubTask  // 多步任务拆解
	Confidence float32
}

// SubTask 子任务定义
type SubTask struct {
	Query  string
	Intent IntentType
}

// IntentAnalyzer 意图分析器
type IntentAnalyzer struct{}

// NewIntentAnalyzer 创建意图分析器
func NewIntentAnalyzer() *IntentAnalyzer {
	return &IntentAnalyzer{}
}

// 预设指代词库（15个）
var referenceWords = []string{
	"它", "它们", "这个", "那个", "这些", "那些",
	"上面", "刚才", "之前", "之前提到的",
	"这篇文章", "那个文件", "上面的内容",
	"那个文档", "上面的文档",
}

// 继续追问标记词
var continueMarkers = []string{
	"继续", "重试", "再来一次", "再试",
	"继续说", "接着说", "还有吗",
	"还有什么", "再说说",
}

// 话题切换标记词
var switchMarkers = []string{
	"换个话题", "说另外", "换个题目",
	"不聊这个", "换个方向", "聊别的",
	"说说别的", "换个内容",
}

// 澄清请求标记词
var clarifyMarkers = []string{
	"什么意思", "具体", "能解释",
	"详细说", "展开", "解释一下",
	"具体说说", "详细解释",
}

// ContainsReference 检测是否包含指代词
func ContainsReference(query string) bool {
	query = strings.ToLower(query)
	for _, word := range referenceWords {
		if strings.Contains(query, word) {
			return true
		}
	}
	return false
}

// ExtractReference 提取指代词
func ExtractReference(query string) string {
	query = strings.ToLower(query)
	for _, word := range referenceWords {
		if strings.Contains(query, word) {
			return word
		}
	}
	return ""
}

// Analyze 分析意图
func (ia *IntentAnalyzer) Analyze(query string, history []ConversationMessage, context *SessionContext) IntentResult {
	query = strings.ToLower(strings.TrimSpace(query))

	// 优先级 1: 多步任务（包含拆解关键词）
	if ia.isMultiStep(query) {
		subTasks := ia.parseMultiStep(query)
		return IntentResult{
			Type:       IntentMultiStep,
			SubTasks:   subTasks,
			Confidence: 0.9,
		}
	}

	// 优先级 2: 话题切换
	for _, marker := range switchMarkers {
		if strings.Contains(query, marker) {
			return IntentResult{
				Type:       IntentSwitch,
				Confidence: 0.95,
			}
		}
	}

	// 优先级 2.5: 继续追问（重试/继续）
	for _, marker := range continueMarkers {
		if strings.Contains(query, marker) && len(history) > 0 {
			return IntentResult{
				Type:       IntentFollowUp,
				Reference:  marker,
				Confidence: 0.85,
			}
		}
	}

	// 优先级 3: 指代追问（有上下文时）
	if len(history) > 0 && len(context.ActiveDocuments) > 0 {
		if ContainsReference(query) {
			return IntentResult{
				Type:       IntentFollowUp,
				Reference:  ExtractReference(query),
				Confidence: 0.8,
			}
		}

		// 优先级 4: 澄清请求
		for _, marker := range clarifyMarkers {
			if strings.Contains(query, marker) {
				return IntentResult{
					Type:       IntentClarify,
					Confidence: 0.75,
				}
			}
		}

		// 优先级 5: 简短追问（可能是追问）
		if len(query) < 20 && ia.isLikelyFollowUp(query) {
			return IntentResult{
				Type:       IntentFollowUp,
				Confidence: 0.6,
			}
		}
	}

	// 优先级 6: 使用原有意图检测（search/summarize/explore/generate/record）
	basicIntent := IntentDetection(query)
	if basicIntent != "record" {
		return IntentResult{
			Type:       IntentType(basicIntent),
			Confidence: 0.7,
		}
	}

	// 默认: 新话题
	return IntentResult{
		Type:       IntentNewTopic,
		Confidence: 0.5,
	}
}

// isMultiStep 检测是否为多步任务
func (ia *IntentAnalyzer) isMultiStep(query string) bool {
	// 检测 "先...再..." 模式
	if strings.Contains(query, "先") && strings.Contains(query, "再") {
		return true
	}
	// 检测 "然后/接着" 模式
	if strings.Contains(query, "然后") || strings.Contains(query, "接着") {
		return true
	}
	// 检测 "分别找...和...然后" 模式
	if strings.Contains(query, "分别") && strings.Contains(query, "然后") {
		return true
	}
	return false
}

// parseMultiStep 解析多步任务
func (ia *IntentAnalyzer) parseMultiStep(query string) []SubTask {
	// 匹配预设模板
	for _, template := range multiStepTemplates {
		if matched, _ := regexp.MatchString(template.Pattern, query); matched {
			return ia.buildSubTasks(query, template)
		}
	}

	// 默认拆解：按关键词分割
	var tasks []SubTask

	// 检测 "先...再..." 模式
	if strings.Contains(query, "先") && strings.Contains(query, "再") {
		// 提取 "先" 后面的内容作为第一个任务
		re1 := regexp.MustCompile(`先([^再]+)再`)
		matches1 := re1.FindStringSubmatch(query)
		if len(matches1) > 1 {
			task1 := ia.cleanQueryPart(matches1[1])
			tasks = append(tasks, SubTask{
				Query:  task1,
				Intent: ia.detectSubIntent(task1),
			})
		}

		// 提取 "再" 后面的内容作为第二个任务
		re2 := regexp.MustCompile(`再(.+)$`)
		matches2 := re2.FindStringSubmatch(query)
		if len(matches2) > 1 {
			task2 := ia.cleanQueryPart(matches2[1])
			tasks = append(tasks, SubTask{
				Query:  task2,
				Intent: ia.detectSubIntent(task2),
			})
		}
	}

	// 检测 "然后/接着" 模式
	if strings.Contains(query, "然后") || strings.Contains(query, "接着") {
		parts := strings.Split(query, "然后")
		if len(parts) < 2 {
			parts = strings.Split(query, "接着")
		}

		for _, part := range parts {
			task := ia.cleanQueryPart(part)
			if task != "" {
				tasks = append(tasks, SubTask{
					Query:  task,
					Intent: ia.detectSubIntent(task),
				})
			}
		}
	}

	// 如果解析失败，返回单任务
	if len(tasks) == 0 {
		tasks = append(tasks, SubTask{
			Query:  query,
			Intent: IntentSearch,
		})
	}

	log.Printf("[IntentAnalyzer] 多步任务解析: %s -> %d 个子任务", query, len(tasks))
	return tasks
}

// MultiStepTemplate 多步任务模板
type MultiStepTemplate struct {
	Name    string
	Pattern string
}

// 预设多步任务模板
var multiStepTemplates = []MultiStepTemplate{
	{Name: "search_then_summarize", Pattern: "先.*找.*再.*总结"},
	{Name: "search_then_compare", Pattern: "先.*找.*再.*对比"},
	{Name: "multi_search_then_synthesize", Pattern: "分别找.*和.*然后.*聚合"},
}

// buildSubTasks 根据模板构建子任务
func (ia *IntentAnalyzer) buildSubTasks(query string, template MultiStepTemplate) []SubTask {
	switch template.Name {
	case "search_then_summarize":
		// 提取检索词
		re := regexp.MustCompile(`找([^再]+)`)
		matches := re.FindStringSubmatch(query)
		searchQuery := ""
		if len(matches) > 1 {
			searchQuery = ia.cleanQueryPart(matches[1])
		}
		return []SubTask{
			{Query: searchQuery, Intent: IntentSearch},
			{Query: "总结这些文档的特点", Intent: IntentSummarize},
		}

	case "search_then_compare":
		re := regexp.MustCompile(`找([^再]+)`)
		matches := re.FindStringSubmatch(query)
		searchQuery := ""
		if len(matches) > 1 {
			searchQuery = ia.cleanQueryPart(matches[1])
		}
		return []SubTask{
			{Query: searchQuery, Intent: IntentSearch},
			{Query: "对比这些文档的差异", Intent: IntentCompare},
		}

	case "multi_search_then_synthesize":
		// 提取两个检索词
		re := regexp.MustCompile(`分别找([^和]+)和([^然]+)`)
		matches := re.FindStringSubmatch(query)
		if len(matches) >= 3 {
			return []SubTask{
				{Query: ia.cleanQueryPart(matches[1]), Intent: IntentSearch},
				{Query: ia.cleanQueryPart(matches[2]), Intent: IntentSearch},
				{Query: "聚合这些内容", Intent: IntentGenerate},
			}
		}
	}

	// 默认返回空
	return nil
}

// cleanQueryPart 清理查询片段
func (ia *IntentAnalyzer) cleanQueryPart(part string) string {
	part = strings.TrimSpace(part)
	// 移除常见的连接词
	removeWords := []string{"一下", "出", "关于", "相关"}
	for _, word := range removeWords {
		part = strings.ReplaceAll(part, word, "")
	}
	return strings.TrimSpace(part)
}

// detectSubIntent 检测子任务意图
func (ia *IntentAnalyzer) detectSubIntent(query string) IntentType {
	query = strings.ToLower(query)

	if strings.Contains(query, "找") || strings.Contains(query, "搜索") || strings.Contains(query, "查") {
		return IntentSearch
	}
	if strings.Contains(query, "总结") || strings.Contains(query, "归纳") {
		return IntentSummarize
	}
	if strings.Contains(query, "对比") || strings.Contains(query, "比较") {
		return IntentCompare
	}
	if strings.Contains(query, "生成") || strings.Contains(query, "写") || strings.Contains(query, "创作") {
		return IntentGenerate
	}

	return IntentSearch
}

// isLikelyFollowUp 检测是否可能是追问（短查询）
func (ia *IntentAnalyzer) isLikelyFollowUp(query string) bool {
	followUpPatterns := []string{
		"呢", "还有呢", "怎么样", "如何",
		"有哪些", "是什么", "为什么",
		"能", "可以", "是否",
	}
	for _, pattern := range followUpPatterns {
		if strings.Contains(query, pattern) {
			return true
		}
	}
	return false
}