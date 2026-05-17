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
	IntentFreeChat   IntentType = "free_chat"    // 随意闲聊/日常招呼
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

// 只允许汉字、英文字母、数字以及下划线和减号的词，用于强力过滤标点符号、表情及连续问号
var wordEntityRegexp = regexp.MustCompile(`^[\p{Han}a-zA-Z0-9_-]+$`)

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
	// 如果用户明确提到了保存、记录等强烈落库特征动作词，不要强行拦截为普通的追问 (FollowUp)
	isStrongAction := false
	strongKeywords := []string{
		"保存", "记录", "存一下", "记一下", "备忘", "收录",
	}
	for _, kw := range strongKeywords {
		if strings.Contains(query, kw) {
			isStrongAction = true
			break
		}
	}

	if !isStrongAction && len(history) > 0 {
		if ContainsReference(query) {
			return IntentResult{
				Type:       IntentFollowUp,
				Reference:  ExtractReference(query),
				Confidence: 0.8,
			}
		}

		// 优先级 3.5: 操作指令（对已有内容操作，需有活跃文档上下文作为承接）
		if len(context.ActiveDocuments) > 0 {
			for _, marker := range operationMarkers {
				if strings.Contains(query, marker) {
					return IntentResult{
						Type:       IntentFollowUp,
						Reference:  marker,
						Confidence: 0.85,
					}
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
	if confidence >= 0.8 {
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
		IntentSearch:    {"找", "查", "查找", "搜索", "检索", "定位", "查阅", "搜一下"},
		IntentSummarize: {"总结", "归纳", "要点", "提炼", "大意", "整理", "梳理", "概括"},
		IntentCompare:   {"对比", "差异", "不同", "区别", "比较", "相同点"},
		IntentGenerate:  {"生成", "写", "创作", "做", "构思", "方案", "大纲"},
		IntentRecord:    {"记", "存", "备忘", "保存", "收录"},
		IntentFreeChat:  {"你好", "您好", "哈喽", "hello", "hi", "谢谢", "感谢", "你是谁", "中文怎么说", "名字"},
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
	// 构建 prompt，要求返回 JSON 格式，并携带历史对话上下文
	prompt := `你是一个意图识别与任务拆解引擎。请分析用户的输入意图。
可选意图类型：
- free_chat: 纯粹的闲聊、打招呼、说谢谢、询问你是谁/你的名字/你的中文名、日常问候与随意聊天（无特定检索、总结或保存需要，用户只想轻松对话）
- search: 检索文档、查找具体知识库信息
- summarize: 对已有内容进行总结、归纳
- compare: 对比多个文档或概念的异同
- generate: 创作、写报告、生成新内容
- follow_up: 对前文的深入追问（例如：在上轮对话引导或上下文选择下做出的具体选择、补充、回答或澄清）
- record: 随手记、备忘（通常很短且没有明显指令，如“记一下xxx”、“存一下xxx”）

如果任务包含多个步骤（如“先找A再总结”），请拆解为 sub_tasks。
请只输出纯 JSON 格式：
{
  "intent": "意图类型",
  "confidence": 0.xx,
  "sub_tasks": [{"query": "子任务查询词", "intent": "子意图"}],
  "reason": "简短理由"
}
%s用户当前输入：%s`

	// 格式化最近的上下文历史，帮助大模型做出精准的多轮意图判断
	var historyContext string
	if len(history) > 0 {
		historyContext = "\n[历史对话上下文（按时间正序排列）]\n"
		startIdx := 0
		if len(history) > 4 {
			startIdx = len(history) - 4
		}
		for _, msg := range history[startIdx:] {
			contentSnippet := msg.Content
			if len([]rune(contentSnippet)) > 150 {
				contentSnippet = string([]rune(contentSnippet)[:150]) + "..."
			}
			historyContext += fmt.Sprintf("[%s]: %s\n", msg.Role, contentSnippet)
		}
		historyContext += "\n"
	}

	fullQuery := fmt.Sprintf(prompt, historyContext, query)
	
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
		if strings.Contains(response, "free_chat") {
			intentType = IntentFreeChat
		} else if strings.Contains(response, "search") {
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

// IsRelatedToHistory 检查当前提问与历史对话是否存在关联，为防前文严重覆盖/污染提供智能校验判定
func IsRelatedToHistory(query string, history []ConversationMessage) bool {
	if len(history) == 0 {
		return true
	}

	query = strings.ToLower(strings.TrimSpace(query))

	// 1. 如果包含指代词，一定有关联
	if ContainsReference(query) {
		return true
	}

	// 2. 检查常用继续和操作标记词，如果有，也是承接上下文的
	allMarkers := []string{"继续", "接着", "还有", "再来", "重试"}
	for _, m := range allMarkers {
		if strings.Contains(query, m) {
			return true
		}
	}

	// 3. 如果 query 太短（比如少于 4 个字/字符），极有可能是简短追问或澄清，判定为有关联
	if len([]rune(query)) < 4 {
		return true
	}

	// 4. 使用 Jieba 分词进行关键词交叉比对
	jieba := synonym.GetJieba()
	if jieba == nil {
		// 降级策略：如果分词不可用，直接通过简单的子串包含判断（忽略常见停用词）
		lastMsg := history[len(history)-1]
		lastContent := strings.ToLower(lastMsg.Content)
		
		words := strings.Fields(query)
		for _, w := range words {
			if len(w) > 3 && strings.Contains(lastContent, w) {
				return true
			}
		}
		return false
	}

	// 提取当前 query 的分词，存入 map 以便 O(1) 查找
	queryWords := jieba.Cut(query, true)
	queryWordMap := make(map[string]bool)
	for _, w := range queryWords {
		w = strings.TrimSpace(strings.ToLower(w))
		// 过滤掉常见中英文停用词、单字、标点符号以及连续问号表情等非业务实体词
		if len([]rune(w)) > 1 && !isStopWord(w) && wordEntityRegexp.MatchString(w) {
			queryWordMap[w] = true
		}
	}

	// 如果 query 过滤后没有有效关键词，默认有关联以防误清空
	if len(queryWordMap) == 0 {
		return true
	}

	// 提取最近两轮历史对话中的所有文本内容
	var historyText strings.Builder
	startIdx := len(history) - 2
	if startIdx < 0 {
		startIdx = 0
	}
	for i := startIdx; i < len(history); i++ {
		historyText.WriteString(strings.ToLower(history[i].Content))
		historyText.WriteString(" ")
	}

	// 分词历史文本并检测交集
	historyWords := jieba.Cut(historyText.String(), true)
	log.Printf("[DEBUG] query=%q, queryWords=%v, queryWordMap=%v, historyWords=%v", query, queryWords, queryWordMap, historyWords)
	for _, w := range historyWords {
		w = strings.TrimSpace(strings.ToLower(w))
		if queryWordMap[w] {
			log.Printf("[Intent] 检测到多轮主题词交叉关联: %q", w)
			return true
		}
	}

	return false
}

// isStopWord 常见中英文停用词快速过滤
func isStopWord(w string) bool {
	stopWords := map[string]bool{
		"的": true, "了": true, "是": true, "我": true, "你": true, "他": true, "它": true,
		"在": true, "有": true, "个": true, "上": true, "下": true, "中": true, "和": true,
		"与": true, "被": true, "让": true, "这": true, "那": true, "都": true, "就": true,
		"吧": true, "呢": true, "啊": true, "呀": true, "吗": true,
		"查找": true, "搜索": true, "查询": true, "检索": true, "定位": true, "搜一下": true,
		"总结": true, "归纳": true, "要点": true, "提炼": true, "大意": true, "整理": true,
		"对比": true, "差异": true, "不同": true, "区别": true, "比较": true,
		"生成": true, "写": true, "创作": true, "做": true, "构思": true, "方案": true,
		"一下": true, "笔记": true, "文档": true, "关于": true, "帮助": true, "有没有": true,
		"怎么": true, "如何": true, "这个": true, "那个": true, "什么": true, "哪里": true,
		"the": true, "is": true, "are": true, "and": true, "to": true, "in": true, "on": true,
	}
	return stopWords[w]
}