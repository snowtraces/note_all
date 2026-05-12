package service

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg"
)

// Tool 工具类型
type Tool string

const (
	ToolSearch    Tool = "search"    // 检索文档
	ToolSummarize Tool = "summarize" // 总结文档
	ToolCompare   Tool = "compare"   // 对比分析
	ToolGenerate  Tool = "generate"  // 生成内容
	ToolAnalyze   Tool = "analyze"   // 分析关系
)

// ToolCall 工具调用请求
type ToolCall struct {
	Tool       Tool
	Parameters map[string]interface{}
}

// ToolResult 工具执行结果
type ToolResult struct {
	Output    string                       // 输出内容
	Documents []SearchResult               // 涉及的文档
	HitChunks map[uint][]ChunkSearchResult // 命中的分片（key 为文档 ID）
	Metadata  map[string]interface{}
}

// ToolCallInfo 返回给前端的工具调用信息
type ToolCallInfo struct {
	Step      int                    `json:"step"`
	Tool      string                 `json:"tool"`
	Input     map[string]interface{} `json:"input"`
	Output    string                 `json:"output"`
	Documents []uint                 `json:"documents"`
	Duration  int64                  `json:"duration"`
	Timestamp string                 `json:"timestamp"`
}

// ToolExecutor 工具执行器
type ToolExecutor struct{}

// NewToolExecutor 创建工具执行器
func NewToolExecutor() *ToolExecutor {
	return &ToolExecutor{}
}

// Execute 执行工具调用（带权限检查）
func (te *ToolExecutor) Execute(call ToolCall) ToolResult {
	log.Printf("[ToolExecutor] 执行工具: %s, 参数: %v", call.Tool, call.Parameters)

	// 权限检查
	pm := NewPermissionManager()
	permResult := pm.CheckPermission(call.Tool, call.Parameters)

	switch permResult {
	case PermissionDeny:
		return ToolResult{Output: "权限拒绝：该工具不允许执行"}
	case PermissionAsk:
		// 高风险工具需要用户确认，返回需要确认的提示
		permInfo := pm.GetPermissionInfo(call.Tool)
		return ToolResult{
			Output: fmt.Sprintf("需要确认：工具 %s 属于高风险操作（%s），请确认是否继续执行。\n工具描述：%s",
				call.Tool, permInfo.RiskLevel, permInfo.Description),
		}
	}

	// 执行工具
	switch call.Tool {
	case ToolSearch:
		return te.executeSearch(call)
	case ToolSummarize:
		return te.executeSummarize(call)
	case ToolCompare:
		return te.executeCompare(call)
	case ToolGenerate:
		return te.executeGenerate(call)
	case ToolAnalyze:
		return te.executeAnalyze(call)
	default:
		return ToolResult{
			Output: fmt.Sprintf("未知工具: %s", call.Tool),
		}
	}
}

// executeSearch 执行检索（返回分片结果，避免完整大文档）
func (te *ToolExecutor) executeSearch(call ToolCall) ToolResult {
	query, _ := call.Parameters["query"].(string)
	if query == "" {
		return ToolResult{Output: "检索查询为空"}
	}

	// 使用分片级混合检索（返回文档 + 命中分片）
	results, hitChunks, err := BatchHybridSearchWithChunks([]string{query}, 20, "")
	if err != nil {
		log.Printf("[ToolExecutor] 检索失败: %v", err)
		return ToolResult{Output: "检索失败: " + err.Error()}
	}

	// 构建简短输出摘要
	var output string
	if len(results) == 0 {
		output = "未找到相关文档"
	} else {
		topTitles := make([]string, 0, 3)
		for i := 0; i < 3 && i < len(results); i++ {
			topTitles = append(topTitles, results[i].OriginalName)
		}
		output = fmt.Sprintf("检索到 %d 篇相关文档，最相关：%s", len(results), strings.Join(topTitles, ", "))
	}

	return ToolResult{
		Output:    output,
		Documents: results,
		HitChunks: hitChunks,
		Metadata:  map[string]interface{}{"query": query, "count": len(results)},
	}
}

// executeSummarize 执行总结
func (te *ToolExecutor) executeSummarize(call ToolCall) ToolResult {
	// 获取文档ID列表
	docIDs := te.extractDocIDs(call.Parameters)
	if len(docIDs) == 0 {
		return ToolResult{Output: "无文档可总结"}
	}

	// 获取文档内容
	var notes []models.NoteItem
	global.DB.Where("id IN ? AND deleted_at IS NULL", docIDs).Find(&notes)
	if len(notes) == 0 {
		return ToolResult{Output: "文档不存在或已删除"}
	}

	// 构建 RAG 上下文
	context := BuildRAGContextFromNotes(notes)

	// 调用 LLM 总结
	systemPrompt := "你是一个知识总结助手。请根据给定的文档内容，提炼出核心要点和关键结论。\n" +
		"要求：\n1. 结构清晰，使用 Markdown 格式\n2. 提炼关键信息，避免冗长\n3. 如有多个文档，合并相关内容\n\n" +
		"【文档内容】开始：\n" + context + "\n【文档内容】结束"

	summary, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": "请总结以上文档的核心要点"},
	}, systemPrompt)

	if err != nil {
		return ToolResult{Output: "总结失败: " + err.Error()}
	}

	// 构建 SearchResult 列表
	results := make([]SearchResult, 0, len(notes))
	for _, note := range notes {
		results = append(results, SearchResult{NoteItem: note, Score: 0.8})
	}

	return ToolResult{
		Output:    summary,
		Documents: results,
		Metadata:  map[string]interface{}{"doc_count": len(notes)},
	}
}

// executeCompare 执行对比分析
func (te *ToolExecutor) executeCompare(call ToolCall) ToolResult {
	docIDs := te.extractDocIDs(call.Parameters)
	if len(docIDs) < 2 {
		return ToolResult{Output: "对比需要至少 2 个文档"}
	}

	var notes []models.NoteItem
	global.DB.Where("id IN ? AND deleted_at IS NULL", docIDs).Find(&notes)
	if len(notes) < 2 {
		return ToolResult{Output: "文档不足，无法对比"}
	}

	// 构建对比上下文
	context := BuildRAGContextFromNotes(notes)

	systemPrompt := "你是一个对比分析助手。请对给定的多个文档进行对比分析。\n" +
		"要求：\n1. 找出相同点和不同点\n2. 使用表格或列表展示对比结果\n3. 突出关键差异\n\n" +
		"【文档内容】开始：\n" + context + "\n【文档内容】结束"

	compareResult, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": "请对比分析以上文档的异同"},
	}, systemPrompt)

	if err != nil {
		return ToolResult{Output: "对比分析失败: " + err.Error()}
	}

	results := make([]SearchResult, 0, len(notes))
	for _, note := range notes {
		results = append(results, SearchResult{NoteItem: note, Score: 0.8})
	}

	return ToolResult{
		Output:    compareResult,
		Documents: results,
		Metadata:  map[string]interface{}{"doc_count": len(notes)},
	}
}

// executeGenerate 执行生成内容
func (te *ToolExecutor) executeGenerate(call ToolCall) ToolResult {
	docIDs := te.extractDocIDs(call.Parameters)
	prompt, _ := call.Parameters["prompt"].(string)
	if prompt == "" {
		prompt = "请根据文档内容生成一份综合报告"
	}

	var notes []models.NoteItem
	if len(docIDs) > 0 {
		global.DB.Where("id IN ? AND deleted_at IS NULL", docIDs).Find(&notes)
	}

	context := ""
	if len(notes) > 0 {
		context = BuildRAGContextFromNotes(notes)
	}

	systemPrompt := "你是一个内容生成助手。请根据用户需求生成相关内容。\n"
	if context != "" {
		systemPrompt += "【参考内容】开始：\n" + context + "\n【参考内容】结束\n"
	}

	generated, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": prompt},
	}, systemPrompt)

	if err != nil {
		return ToolResult{Output: "生成失败: " + err.Error()}
	}

	results := make([]SearchResult, 0, len(notes))
	for _, note := range notes {
		results = append(results, SearchResult{NoteItem: note, Score: 0.7})
	}

	return ToolResult{
		Output:    generated,
		Documents: results,
		Metadata:  map[string]interface{}{"prompt": prompt},
	}
}

// executeAnalyze 执行关系分析
func (te *ToolExecutor) executeAnalyze(call ToolCall) ToolResult {
	docID, _ := call.Parameters["doc_id"].(uint)
	if docID == 0 {
		// 尝试从 docIDs 获取第一个
		docIDs := te.extractDocIDs(call.Parameters)
		if len(docIDs) > 0 {
			docID = docIDs[0]
		}
	}

	if docID == 0 {
		return ToolResult{Output: "未指定要分析的文档"}
	}

	// 获取关联笔记
	related, err := GetRelatedNotes(docID)
	if err != nil {
		return ToolResult{Output: "分析失败: " + err.Error()}
	}

	// 构建分析结果
	output := fmt.Sprintf("文档 #%d 的关联分析结果：\n", docID)
	for i, r := range related {
		output += fmt.Sprintf("%d. %s (关联度: %.2f)\n", i+1, r.OriginalName, 0.5)
	}

	results := make([]SearchResult, 0, len(related))
	for _, note := range related {
		results = append(results, SearchResult{NoteItem: note, Score: 0.5})
	}

	return ToolResult{
		Output:    output,
		Documents: results,
		Metadata:  map[string]interface{}{"source_doc": docID, "related_count": len(related)},
	}
}

// extractDocIDs 从参数中提取文档ID列表
func (te *ToolExecutor) extractDocIDs(params map[string]interface{}) []uint {
	// 尝试从多个参数源获取
	for _, key := range []string{"documents", "prev_documents"} {
		if ids := parseIDsFromInterface(params[key]); len(ids) > 0 {
			return ids
		}
	}
	return nil
}

// parseIDsFromInterface 从接口值解析 ID 列表
func parseIDsFromInterface(v interface{}) []uint {
	if v == nil {
		return nil
	}

	switch val := v.(type) {
	case []uint:
		return val
	case []interface{}:
		result := make([]uint, 0, len(val))
		for _, id := range val {
			switch idVal := id.(type) {
			case uint:
				result = append(result, idVal)
			case int:
				result = append(result, uint(idVal))
			case float64:
				result = append(result, uint(idVal))
			}
		}
		return result
	case string:
		var ids []uint
		if json.Unmarshal([]byte(val), &ids) == nil {
			return ids
		}
	}
	return nil
}

// BuildToolCallInfo 构建前端展示的工具调用信息
func (te *ToolExecutor) BuildToolCallInfo(step int, call ToolCall, result ToolResult, duration int64) ToolCallInfo {
	// 截断输出
	output := result.Output
	if len(output) > 200 {
		output = output[:200] + "..."
	}

	// 提取文档ID
	docIDs := make([]uint, 0)
	for _, doc := range result.Documents {
		docIDs = append(docIDs, doc.ID)
	}

	return ToolCallInfo{
		Step:      step,
		Tool:      string(call.Tool),
		Input:     call.Parameters,
		Output:    output,
		Documents: docIDs,
		Duration:  duration,
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}
}

// BuildRAGContextFromNotes 从笔记列表构建上下文
func BuildRAGContextFromNotes(notes []models.NoteItem) string {
	if len(notes) == 0 {
		return ""
	}

	var sb strings.Builder
	for i, note := range notes {
		sb.WriteString(fmt.Sprintf("[%d] 标题: %s\n摘要: %s\n内容: %s\n\n",
			i+1, note.OriginalName, note.AiSummary, note.OcrText))
		if sb.Len() > 15000 {
			sb.WriteString("... (内容过长，已截断)")
			break
		}
	}
	return sb.String()
}

// ExecuteWithTiming 执行工具调用并记录耗时
func (te *ToolExecutor) ExecuteWithTiming(step int, call ToolCall) (ToolResult, ToolCallInfo) {
	start := time.Now()
	result := te.Execute(call)
	duration := time.Since(start).Milliseconds()

	info := te.BuildToolCallInfo(step, call, result, duration)
	return result, info
}