package service

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"

	"note_all_backend/pkg"
	"note_all_backend/pkg/synonym"
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

// 操作指令标记词（对已有内容进行操作，不触发新检索）
var operationMarkers = []string{
	"表格化", "列表化", "列出", "整理",
	"归纳", "提炼", "概括", "精简",
	"换个格式", "换个方式", "重新组织",
	"分类", "归类", "排序",
	"简化", "详细", "补充",
	"换个角度", "换个视角",
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
			// 尝试寻找上一轮的动作
			lastMsg := history[len(history)-1]
			if lastMsg.Role == "assistant" {
				return IntentResult{
					Type:       IntentFollowUp,
					Reference:  marker,
					Confidence: 0.9,
				}
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

		// 优先级 3.5: 操作指令（对已有内容操作，不触发新检索）
		for _, marker := range operationMarkers {
			if strings.Contains(query, marker) {
				return IntentResult{
					Type:       IntentFollowUp,
					Reference:  marker,
					Confidence: 0.85,
				}
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

	// 优先级 6: 混合意图检测（Jieba 分词 + 关键词）
	basicIntent, confidence := ia.detectWithJieba(query)
	if confidence > 0.8 {
		return IntentResult{
			Type:       basicIntent,
			Confidence: confidence,
		}
	}

	// 优先级 7: LLM 意图识别（兜底）
	log.Printf("[IntentAnalyzer] 低置信度意图，触发 LLM 识别...")
	llmIntent := ia.analyzeWithLLM(query, history)
	return llmIntent
}

// detectWithJieba 使用 Jieba 分词进行意图识别
func (ia *IntentAnalyzer) detectWithJieba(query string) (IntentType, float32) {
	jieba := synonym.GetJieba()
	if jieba == nil {
		// 回退到简单关键词匹配
		return IntentType(IntentDetection(query)), 0.6
	}

	// 1. 分词
	words := jieba.Cut(query, true)
	wordMap := make(map[string]bool)
	for _, w := range words {
		wordMap[w] = true
	}

	// 2. 核心特征词库
	features := map[IntentType][]string{
		IntentSearch:    {"找", "查", "搜索", "检索", "定位", "哪些", "哪里", "谁", "什么时候"},
		IntentSummarize: {"总结", "归纳", "要点", "提炼", "大意", "整理", "梳理", "概括"},
		IntentCompare:   {"对比", "差异", "不同", "区别", "比较", "相同点"},
		IntentGenerate:  {"生成", "写", "创作", "做", "构思", "报告", "方案", "大纲"},
		IntentRecord:    {"记", "存", "备忘", "保存", "收录"},
	}

	bestIntent := IntentNewTopic
	maxScore := float32(0)

	for intent, keywords := range features {
		score := float32(0)
		for _, kw := range keywords {
			if wordMap[kw] {
				score += 1.0
			}
		}
		if score > maxScore {
			maxScore = score
			bestIntent = intent
		}
	}

	if maxScore > 0 {
		return bestIntent, 0.7 + (maxScore * 0.1)
	}

	return IntentNewTopic, 0.4
}

// analyzeWithLLM 使用 LLM 进行意图识别
func (ia *IntentAnalyzer) analyzeWithLLM(query string, history []ConversationMessage) IntentResult {
	// 构建 prompt，要求返回 JSON 格式
	prompt := `你是一个意图识别与任务拆解引擎。请分析用户的输入意图。
可选意图类型：
- search: 检索文档、查找具体信息
- summarize: 对已有内容进行总结、归纳
- compare: 对比多个文档或概念的异同
- generate: 创作、写报告、生成新内容
- follow_up: 对前文的深入追问
- record: 随手记、备忘（通常很短且没有明显指令）

如果任务包含多个步骤（如“先找A再总结”），请拆解为 sub_tasks。
请只输出纯 JSON 格式：
{
  "intent": "意图类型",
  "confidence": 0.xx,
  "sub_tasks": [{"query": "子任务查询词", "intent": "子意图"}],
  "reason": "简短理由"
}
用户输入：%s`

	fullQuery := fmt.Sprintf(prompt, query)
	
	// 调用 LLM
	response, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": fullQuery},
	}, "你是一个精准的语义分析助手。")

	if err != nil {
		log.Printf("[IntentAnalyzer] LLM 识别失败: %v", err)
		return IntentResult{Type: IntentNewTopic, Confidence: 0.5}
	}

	// 智能解析 JSON
	var result struct {
		Intent     string    `json:"intent"`
		Confidence float32   `json:"confidence"`
		SubTasks   []SubTask `json:"sub_tasks"`
	}
	
	// 寻找 JSON 块
	re := regexp.MustCompile(`(?s)\{.*\}`)
	jsonStr := re.FindString(response)
	if jsonStr != "" {
		if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
			log.Printf("[IntentAnalyzer] 解析 LLM JSON 失败: %v", err)
		}
	}

	intentType := IntentType(result.Intent)
	if intentType == "" {
		// 关键词兜底
		if strings.Contains(response, "search") {
			intentType = IntentSearch
		} else if strings.Contains(response, "summarize") {
			intentType = IntentSummarize
		} else if strings.Contains(response, "compare") {
			intentType = IntentCompare
		} else if strings.Contains(response, "generate") {
			intentType = IntentGenerate
		} else {
			intentType = IntentNewTopic
		}
	}

	return IntentResult{
		Type:       intentType,
		Confidence: result.Confidence,
		SubTasks:   result.SubTasks,
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

	log.Printf("[IntentAnalyzer] 多步任务解析: %s -> %d 个子任务", query, len(tasks))
	
	// 如果正则解析得到的子任务太少或太简单，尝试 LLM 解析
	if len(tasks) <= 1 && len([]rune(query)) > 15 {
		llmResult := ia.analyzeWithLLM(query, nil)
		if len(llmResult.SubTasks) > 1 {
			return llmResult.SubTasks
		}
	}

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