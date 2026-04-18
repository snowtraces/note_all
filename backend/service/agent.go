package service

import (
	"fmt"
	"log"
	"strings"
	"time"
)

// AgentResponse Agent 响应结构
type AgentResponse struct {
	Content      string          `json:"content"`      // 最终回复
	SessionID    uint            `json:"session_id"`   // 会话 ID
	References   []ReferenceItem `json:"references"`   // 引用文档
	Intent       string          `json:"intent"`       // 意图类型
	Confidence   float32         `json:"confidence"`   // 意图置信度
	ToolCalls    []ToolCallInfo  `json:"tool_calls"`   // 工具调用过程
}

// ReferenceItem 文档级引用
type ReferenceItem struct {
	DocumentID uint    `json:"document_id"`
	Title      string  `json:"title"`
	Summary    string  `json:"summary"`
	Relevance  float32 `json:"relevance"`
}

// Agent 核心组件
type Agent struct {
	sessionManager  *SessionManager
	intentAnalyzer  *IntentAnalyzer
	queryRewriter   *QueryRewriter
	toolExecutor    *ToolExecutor
}

// defaultAgent 全局单例 Agent
var defaultAgent = NewAgent()

// NewAgent 创建 Agent
func NewAgent() *Agent {
	return &Agent{
		sessionManager:  NewSessionManager(),
		intentAnalyzer:  NewIntentAnalyzer(),
		queryRewriter:   NewQueryRewriter(),
		toolExecutor:    NewToolExecutor(),
	}
}

// AgentAsk Agent 主入口（使用单例）
func AgentAsk(sessionID uint, query string) (*AgentResponse, error) {
	return defaultAgent.Ask(sessionID, query)
}

// Ask 执行问答流程
func (a *Agent) Ask(sessionID uint, query string) (*AgentResponse, error) {
	log.Printf("[Agent] 开始处理: session=%d, query=%s", sessionID, query)

	// 1. 加载会话历史
	session, err := a.sessionManager.LoadSession(sessionID)
	if err != nil {
		log.Printf("[Agent] 加载会话失败: %v", err)
		// 创建新会话继续
		session = &ConversationSession{
			ID:       0,
			Messages: []ConversationMessage{},
			Context:  &SessionContext{},
		}
	}

	// 2. 分析意图
	intent := a.intentAnalyzer.Analyze(query, session.Messages, session.Context)
	log.Printf("[Agent] 意图分析: type=%s, confidence=%.2f", intent.Type, intent.Confidence)

	// 3. 根据意图分支处理
	var toolResults []ToolResult
	var toolCallInfos []ToolCallInfo

	switch intent.Type {
	case IntentMultiStep:
		// 多步任务：顺序执行子任务
		toolResults, toolCallInfos = a.executeMultiStep(intent.SubTasks, session)

	case IntentFollowUp, IntentClarify:
		// 追问/澄清：重写查询，结合上下文
		toolResults, toolCallInfos = a.executeFollowUp(query, session, intent)

	case IntentSwitch:
		// 切换话题：清空上下文
		session.Context = &SessionContext{}
		session.Messages = []ConversationMessage{} // 清空历史
		toolResults, toolCallInfos = a.executeNewTopic(query, session.Messages)

	case IntentNewTopic, IntentSearch, IntentSummarize:
		// 新话题/检索/总结：原有 RAG 流程，传入历史对话
		toolResults, toolCallInfos = a.executeNewTopic(query, session.Messages)

	default:
		// 其他：默认 RAG
		toolResults, toolCallInfos = a.executeNewTopic(query, session.Messages)
	}

	// 4. 构建最终回复
	response := a.buildResponse(toolResults, toolCallInfos, intent, session.ID)

	// 5. 更新上下文
	a.updateContext(session.Context, toolResults, intent)

	// 6. 保存对话历史
	newSessionID, err := a.sessionManager.SaveTurn(session.ID, ConversationMessage{
		Role:       "user",
		Content:    query,
		Intent:     string(intent.Type),
		Timestamp:  time.Now(),
	})
	if err != nil {
		log.Printf("[Agent] 保存用户消息失败: %v", err)
	}

	_, err = a.sessionManager.SaveTurn(newSessionID, ConversationMessage{
		Role:       "assistant",
		Content:    response.Content,
		References: extractDocIDsFromResults(toolResults),
		Intent:     string(intent.Type),
		Timestamp:  time.Now(),
	})
	if err != nil {
		log.Printf("[Agent] 保存助手消息失败: %v", err)
	}

	// 7. 更新会话上下文到数据库
	a.sessionManager.UpdateContext(newSessionID, session.Context)

	// 8. 检查是否需要压缩历史
	a.sessionManager.CompressHistory(newSessionID)

	response.SessionID = newSessionID

	log.Printf("[Agent] 处理完成: session=%d, intent=%s, refs=%d",
		newSessionID, intent.Type, len(response.References))

	return response, nil
}

// executeMultiStep 执行多步任务
func (a *Agent) executeMultiStep(subTasks []SubTask, session *ConversationSession) ([]ToolResult, []ToolCallInfo) {
	results := make([]ToolResult, 0)
	infos := make([]ToolCallInfo, 0)
	prevDocIDs := make([]uint, 0)

	for i, task := range subTasks {
		log.Printf("[Agent] 多步任务 [%d]: query=%s, intent=%s", i, task.Query, task.Intent)

		// 构建工具调用
		call := ToolCall{
			Tool:       mapSubIntentToTool(task.Intent),
			Parameters: map[string]interface{}{"query": task.Query},
		}

		// 如果有前一步的文档，传递给当前步骤
		if len(prevDocIDs) > 0 && (call.Tool == ToolSummarize || call.Tool == ToolCompare || call.Tool == ToolGenerate) {
			call.Parameters["prev_documents"] = prevDocIDs
		}

		// 执行工具
		result, info := a.toolExecutor.ExecuteWithTiming(i+1, call)
		results = append(results, result)
		infos = append(infos, info)

		// 检查是否执行失败（输出包含失败信息）
		if strings.Contains(result.Output, "失败") || strings.Contains(result.Output, "不存在") {
			log.Printf("[Agent] 多步任务 [%d] 执行失败，中断后续步骤", i)
			break
		}

		// 保存文档ID供后续步骤使用
		for _, doc := range result.Documents {
			prevDocIDs = append(prevDocIDs, doc.ID)
		}
	}

	return results, infos
}

// executeFollowUp 执行追问/澄清
func (a *Agent) executeFollowUp(query string, session *ConversationSession, intent IntentResult) ([]ToolResult, []ToolCallInfo) {
	// 重写查询
	rewrite := a.queryRewriter.Rewrite(query, session.Messages, session.Context)

	// 判断是否仅使用关注文档（不需要新检索）
	if a.queryRewriter.FocusOnly(rewrite) && len(rewrite.FocusDocuments) > 0 {
		// 直接使用已有文档回答
		log.Printf("[Agent] 追问模式：使用 %d 个关注文档", len(rewrite.FocusDocuments))

		call := ToolCall{
			Tool:       ToolSummarize,
			Parameters: map[string]interface{}{
				"documents": rewrite.FocusDocuments,
				"prompt":    query,
			},
		}

		result, info := a.toolExecutor.ExecuteWithTiming(1, call)
		return []ToolResult{result}, []ToolCallInfo{info}
	}

	// 需要新检索，使用重写后的查询
	log.Printf("[Agent] 追问模式：重写查询 %s -> %s", query, rewrite.RewrittenQuery)

	// 如果有多个检索词，使用批量检索
	if len(rewrite.ExpandedTerms) > 1 {
		call := ToolCall{
			Tool:       ToolSearch,
			Parameters: map[string]interface{}{
				"queries": rewrite.ExpandedTerms,
			},
		}
		result, info := a.toolExecutor.ExecuteWithTiming(1, call)
		return []ToolResult{result}, []ToolCallInfo{info}
	}

	// 单查询检索
	call := ToolCall{
		Tool:       ToolSearch,
		Parameters: map[string]interface{}{"query": rewrite.RewrittenQuery},
	}
	result, info := a.toolExecutor.ExecuteWithTiming(1, call)
	return []ToolResult{result}, []ToolCallInfo{info}
}

// executeNewTopic 执行新话题检索（带历史对话）
func (a *Agent) executeNewTopic(query string, history []ConversationMessage) ([]ToolResult, []ToolCallInfo) {
	log.Printf("[Agent] 新话题模式: query=%s, history_len=%d", query, len(history))

	// 使用带历史的 RAG 流程
	answer, results, _, err := RAGAskWithHistory(query, history)
	if err != nil {
		log.Printf("[Agent] RAG 执行失败: %v", err)
		return []ToolResult{
			{Output: "处理失败: " + err.Error()},
		}, []ToolCallInfo{}
	}

	// 构建 ToolCallInfo（模拟一步）
	info := ToolCallInfo{
		Step:      1,
		Tool:      "rag_search",
		Input:     map[string]interface{}{"query": query, "history_len": len(history)},
		Output:    fmt.Sprintf("检索到 %d 篇文档", len(results)),
		Documents: extractDocIDsFromResults([]ToolResult{{Documents: results}}),
		Duration:  0,
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}

	return []ToolResult{
		{Output: answer, Documents: results},
	}, []ToolCallInfo{info}
}

// buildResponse 构建响应
func (a *Agent) buildResponse(toolResults []ToolResult, toolCallInfos []ToolCallInfo, intent IntentResult, sessionID uint) *AgentResponse {
	// 合并所有输出
	var content string
	var allDocs []SearchResult

	if len(toolResults) == 1 {
		content = toolResults[0].Output
		allDocs = toolResults[0].Documents
	} else if len(toolResults) > 1 {
		// 多步任务：合并输出
		var sb strings.Builder
		for i, result := range toolResults {
			if i > 0 {
				sb.WriteString("\n\n---\n\n")
			}
			sb.WriteString(result.Output)
			allDocs = append(allDocs, result.Documents...)
		}
		content = sb.String()
	}

	// 去重文档
	uniqueDocs := uniqueSearchResults(allDocs)

	// 构建引用列表
	references := buildReferences(uniqueDocs)

	return &AgentResponse{
		Content:    content,
		SessionID:  sessionID,
		References: references,
		Intent:     string(intent.Type),
		Confidence: intent.Confidence,
		ToolCalls:  toolCallInfos,
	}
}

// updateContext 更新会话上下文
func (a *Agent) updateContext(context *SessionContext, toolResults []ToolResult, intent IntentResult) {
	switch intent.Type {
	case IntentNewTopic, IntentSearch:
		// 新话题：替换 ActiveDocuments
		newDocs := extractDocIDsFromResults(toolResults)
		if len(newDocs) > 0 {
			context.ActiveDocuments = newDocs
			// 提取话题（从第一个文档标题）
			if len(newDocs) > 0 {
				context.ActiveTopic = a.queryRewriter.getDocumentTitle(newDocs[0])
			}
		}

	case IntentFollowUp, IntentClarify:
		// 追问：追加文档（不替换）
		newDocs := extractDocIDsFromResults(toolResults)
		for _, docID := range newDocs {
			if !containsUint(context.ActiveDocuments, docID) {
				context.ActiveDocuments = append(context.ActiveDocuments, docID)
			}
		}
		// 限制最多 10 个
		if len(context.ActiveDocuments) > 10 {
			context.ActiveDocuments = context.ActiveDocuments[:10]
		}

	case IntentSwitch:
		// 切换：清空
		context.ActiveDocuments = nil
		context.ActiveTopic = ""
	}

	context.LastIntent = string(intent.Type)
}

// 辅助函数

func mapSubIntentToTool(intent IntentType) Tool {
	switch intent {
	case IntentSearch:
		return ToolSearch
	case IntentSummarize:
		return ToolSummarize
	case IntentCompare:
		return ToolCompare
	case IntentGenerate:
		return ToolGenerate
	default:
		return ToolSearch
	}
}

func extractDocIDsFromResults(results []ToolResult) []uint {
	ids := make([]uint, 0)
	for _, result := range results {
		for _, doc := range result.Documents {
			ids = append(ids, doc.ID)
		}
	}
	return uniqueUintIDs(ids)
}

func uniqueUintIDs(ids []uint) []uint {
	seen := make(map[uint]bool)
	result := make([]uint, 0)
	for _, id := range ids {
		if !seen[id] {
			seen[id] = true
			result = append(result, id)
		}
	}
	return result
}

func containsUint(list []uint, item uint) bool {
	for _, v := range list {
		if v == item {
			return true
		}
	}
	return false
}

func uniqueSearchResults(docs []SearchResult) []SearchResult {
	seen := make(map[uint]bool)
	result := make([]SearchResult, 0)
	for _, doc := range docs {
		if !seen[doc.ID] {
			seen[doc.ID] = true
			result = append(result, doc)
		}
	}
	return result
}

func buildReferences(docs []SearchResult) []ReferenceItem {
	refs := make([]ReferenceItem, 0, len(docs))
	for _, doc := range docs {
		summary := doc.AiSummary
		if len(summary) > 100 {
			summary = string([]rune(summary)[:100]) + "..."
		}
		refs = append(refs, ReferenceItem{
			DocumentID: doc.ID,
			Title:      doc.OriginalName,
			Summary:    summary,
			Relevance:  doc.Score,
		})
	}
	return refs
}