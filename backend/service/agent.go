package service

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg/synonym"
)

// AgentResponse Agent 响应结构
type AgentResponse struct {
	Content    string          `json:"content"`    // 最终回复
	SessionID  uint            `json:"session_id"` // 会话 ID
	References []ReferenceItem `json:"references"` // 引用文档
	Intent     string          `json:"intent"`     // 意图类型
	Confidence float32         `json:"confidence"` // 意图置信度
	ToolCalls  []ToolCallInfo  `json:"tool_calls"` // 工具调用过程
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
	sessionManager *SessionManager
	intentAnalyzer *IntentAnalyzer
	queryRewriter  *QueryRewriter
	toolExecutor   *ToolExecutor
}

// defaultAgent 全局单例 Agent
var defaultAgent = NewAgent()

// NewAgent 创建 Agent
func NewAgent() *Agent {
	return &Agent{
		sessionManager: NewSessionManager(),
		intentAnalyzer: NewIntentAnalyzer(),
		queryRewriter:  NewQueryRewriter(),
		toolExecutor:   NewToolExecutor(),
	}
}

// BuildSystemPrompt 构建全局系统提示词
func (a *Agent) BuildSystemPrompt() string {
	var sb strings.Builder

	// 1. 基础协议与 ReAct 规范 (Global Protocol)
	sb.WriteString("=== CORE PROTOCOL ===\n")
	sb.WriteString("1. Use the **ReAct** pattern for complex tasks (DO NOT TRANSLATE THESE KEYWORDS):\n")
	sb.WriteString("   - Thought: [Describe your reasoning process and plan in Chinese]\n")
	sb.WriteString("   - Action: ToolName({\"key\": \"value\"})\n")
	sb.WriteString("   - IMPORTANT: For actions requiring persistence (e.g., saving a note), you **MUST** call the corresponding tool (e.g., `save_note`). Never state that you have saved or performed a persistent action unless you have received a success message from the tool.\n")
	sb.WriteString("   - IMPORTANT: DO NOT include any factual information or \"Final Answer\" content in the same message as an Action. You must wait for the tool result before providing the final answer.\n")
	sb.WriteString("   - Wait for the tool result before providing the final answer.\n")
	sb.WriteString("   IMPORTANT: Always use English keyword 'Action:' and 'Thought:', and keep tool names and parameters in the specified format. Do not use XML tags or other formats.\n")
	sb.WriteString("   Example Action: search({\"query\": \"AI development\"})\n\n")
	sb.WriteString("2. Use [[Title]] format for internal links to other notes.\n")
	sb.WriteString("3. Respond in a helpful, concise, and professional tone.\n\n")
	sb.WriteString("=== RECORD PROTOCOL ===\n")
	sb.WriteString("If the user wants to 'save', 'record', or 'remember' something from the current conversation:\n")
	sb.WriteString("1. **Summarize** the key points discussed so far.\n")
	sb.WriteString("2. **Title** it appropriately (e.g., Topic_Year-Month-Day).\n")
	sb.WriteString("3. **Action**: Call `save_note` tool immediately. DO NOT perform unnecessary searches for duplicates unless explicitly asked.\n\n")

	// 2. 身份与记忆 (Memory & Identity)
	memory := GetMemoryManager()
	sb.WriteString(memory.GetMemoryPrompt())
	sb.WriteString("\n")

	// 3. 技能列表 (Capabilities)
	sb.WriteString("=== AVAILABLE SKILLS ===\n")
	registry := GetSkillRegistry()
	for _, skill := range registry.List() {
		sb.WriteString(fmt.Sprintf("- %s: %s (Usage: %s)\n", skill.Name(), skill.Description(), skill.Usage()))
	}

	return sb.String()
}

// AgentAsk Agent 主入口（使用单例）
func AgentAsk(sessionID uint, query string) (*AgentResponse, error) {
	return defaultAgent.Ask(sessionID, query)
}

// Ask 执行问答流程（使用 QueryLoop 状态机）
func (a *Agent) Ask(sessionID uint, query string) (*AgentResponse, error) {
	log.Printf("[Agent] ========== 开始处理 ==========")
	log.Printf("[Agent] 会话ID: %d, 用户输入: %q", sessionID, query)

	originalQuery := query // 保存原始输入，用于后续持久化历史

	// 1.1 构建全局系统提示词 (包含协议、技能和记忆)
	systemPrompt := a.BuildSystemPrompt()
	log.Printf("[Agent] 已加载全局系统提示词（含协议、技能与持久化记忆）")

	// 1. 加载会话历史
	session, err := a.sessionManager.LoadSession(sessionID)
	if err != nil {
		log.Printf("[Agent] [警告] 加载会话失败: %v，创建新会话", err)
		session = &ConversationSession{
			ID:       0,
			Messages: []ConversationMessage{},
			Context:  &SessionContext{},
		}
	} else {
		log.Printf("[Agent] 会话历史: %d 条消息, %d 个活跃文档", len(session.Messages), len(session.Context.ActiveDocuments))
	}

	// 2. 分析意图（在 QueryLoop 之前）
	intent := a.intentAnalyzer.Analyze(query, session.Messages, session.Context)
	log.Printf("[Agent] 意图分析结果: type=%s, confidence=%.2f", intent.Type, intent.Confidence)
	if intent.Type == IntentMultiStep && len(intent.SubTasks) > 0 {
		log.Printf("[Agent] 多步任务拆解: %d 个子任务", len(intent.SubTasks))
		for i, sub := range intent.SubTasks {
			log.Printf("[Agent]   子任务[%d]: intent=%s, query=%q", i+1, sub.Intent, sub.Query)
		}
	}

	// 3. 创建 QueryLoop 状态
	state := NewQueryState(session.ID, session.Messages, session.Context)

	// 4. 根据意图类型，决定初始工具调用
	var initialToolCalls []ToolCall
	switch intent.Type {
	case IntentMultiStep:
		// 多步任务：按意图构建工具调用序列
		for _, subTask := range intent.SubTasks {
			initialToolCalls = append(initialToolCalls, ToolCall{
				Tool:       mapSubIntentToTool(subTask.Intent),
				Parameters: map[string]interface{}{"query": subTask.Query},
			})
		}
	case IntentSearch:
		initialToolCalls = []ToolCall{{Tool: ToolSearch, Parameters: map[string]interface{}{"query": cleanQueryForSearch(query)}}}
	case IntentSummarize:
		initialToolCalls = []ToolCall{{Tool: ToolSummarize, Parameters: map[string]interface{}{"query": cleanQueryForSearch(query)}}}
	case IntentCompare:
		initialToolCalls = []ToolCall{{Tool: ToolCompare, Parameters: map[string]interface{}{"query": cleanQueryForSearch(query)}}}
	case IntentGenerate:
		initialToolCalls = []ToolCall{{Tool: ToolGenerate, Parameters: map[string]interface{}{"query": cleanQueryForSearch(query)}}}
	case IntentFollowUp, IntentClarify:
		// 追问/澄清：如果已有文档，不触发新检索
		if len(session.Context.ActiveDocuments) > 0 {
			// 有活跃文档，直接让 LLM 处理（不触发新检索）
			log.Printf("[Agent] 追问模式: 有 %d 个活跃文档，不触发新检索", len(session.Context.ActiveDocuments))
			initialToolCalls = nil // 不设置工具调用
		} else {
			// 无活跃文档，使用查询重写检索
			rewrite := a.queryRewriter.Rewrite(query, session.Messages, session.Context)
			initialToolCalls = []ToolCall{{Tool: ToolSearch, Parameters: map[string]interface{}{"query": rewrite.RewrittenQuery}}}
		}
	case IntentSwitch:
		// 切换话题：清空上下文
		session.Context = &SessionContext{}
		session.Messages = []ConversationMessage{}
		state = NewQueryState(session.ID, session.Messages, session.Context)
		initialToolCalls = []ToolCall{{Tool: ToolSearch, Parameters: map[string]interface{}{"query": query}}}
	case IntentRecord:
		// 记录意图安全检查：如果是疑问句（如“怎么保存”、“如何记笔记”），不触发自动保存，转为 RAG 回答
		if isQuestion(query) {
			log.Printf("[Agent] 记录意图检测到疑问特征，转为 RAG 回答")
			initialToolCalls = []ToolCall{{Tool: ToolSearch, Parameters: map[string]interface{}{"query": query}}}
		} else {
			// 确认为“记录指令”：强制转为“总结+保存”多步任务
			initialToolCalls = []ToolCall{
				{Tool: ToolGenerate, Parameters: map[string]interface{}{"query": "请基于当前对话内容，整理出一份结构清晰、专业、详细的 Markdown 笔记，包含核心要点、代码片段或方案建议。"}},
				{Tool: ToolSaveNote, Parameters: map[string]interface{}{"title": "整理笔记_" + time.Now().Format("2006-01-02")}},
			}
		}
	default:
		// 新话题：使用 RAG 流程
		initialToolCalls = []ToolCall{{Tool: ToolSearch, Parameters: map[string]interface{}{"query": query}}}
	}

	// 5. 设置初始工具调用
	state.ActiveToolCalls = initialToolCalls

	// 提前声明，供追问模式和循环使用
	var finalResponse *AgentResponse
	var toolCallInfos []ToolCallInfo
	var allToolResults []ToolResult // 收集所有工具执行结果

	// 5.5 追问模式：加载已有文档到 state.ToolResults 和 allToolResults（含分片）
	if len(initialToolCalls) == 0 && len(session.Context.ActiveDocuments) > 0 {
		// 加载活跃文档内容（含分片信息，用于精简上下文）
		docs, hitChunks := loadDocumentsByIDWithChunks(session.Context.ActiveDocuments)
		if len(docs) > 0 {
			// 优先使用分片上下文，若无分片则使用完整文档
			var output string
			if len(hitChunks) > 0 {
				output = BuildRAGContextFromChunks(docs, hitChunks)
			} else {
				output = BuildRAGContext(docs)
			}
			toolResult := ToolResult{
				Output:    output,
				Documents: docs,
				HitChunks: hitChunks,
			}
			state.ToolResults = []ToolResult{toolResult}
			allToolResults = []ToolResult{toolResult} // 同时加入收集列表，用于构建 References
			log.Printf("[Agent] 加载 %d 个活跃文档到上下文（含 %d 个分片）", len(docs), len(hitChunks))
		}
	}

	// 6. 执行 QueryLoop（多轮循环）
	maxIterations := 5 // 防止无限循环
	iterations := 0

loop:
	for iterations < maxIterations {
		iterations++
		log.Printf("[Agent] QueryLoop iteration=%d, tool_calls=%d", iterations, len(state.ActiveToolCalls))

		// 如果有待执行的工具调用，先执行工具
		if len(state.ActiveToolCalls) > 0 {
			toolResults, infos, hasError := a.executeToolCalls(state)
			toolCallInfos = append(toolCallInfos, infos...)
			allToolResults = append(allToolResults, toolResults...) // 收集结果

			// 将工具结果加入状态（供 LLM 获取文档上下文）
			state.ToolResults = append(state.ToolResults, toolResults...)

			// 将工具结果加入消息
			for _, result := range toolResults {
				state.Messages = append(state.Messages, ConversationMessage{
					Role:      "user",
					Content:   "[工具执行结果]\n" + result.Output,
					Timestamp: time.Now(),
				})
			}

			// 如果执行失败，立即中断并返回
			if hasError {
				log.Printf("[Agent] 工具执行存在错误，中断流程并返回")
				finalResponse = a.buildResponse(toolResults, toolCallInfos, intent, state.SessionID)
				break loop
			}

			// 清空已执行的工具调用
			state.ActiveToolCalls = nil
			state.TurnCount++

			// 继续循环，让 LLM 处理工具结果（下一轮不需要再次发送原始 query）
			query = ""
			continue
		}

		// 执行 QueryLoop（调用 LLM，传入系统提示词）
		result := QueryLoop(state, query, systemPrompt)

		switch result.Transition {
		case TransitionStop:
			// 正常停止
			if result.Error != nil {
				log.Printf("[Agent] QueryLoop 错误: %v", result.Error)
				// 返回部分结果（如果有）
				if result.Response != nil {
					// 合并文档引用
					result.Response.References = buildReferences(extractDocsFromResults(allToolResults))
					result.Response.ToolCalls = toolCallInfos
					result.Response.Intent = string(intent.Type)
					result.Response.Confidence = intent.Confidence
					return result.Response, nil
				}
				return nil, result.Error
			}
			if result.Response != nil {
				finalResponse = result.Response
				// 合并文档引用（从工具执行结果中提取）
				finalResponse.References = buildReferences(extractDocsFromResults(allToolResults))
				finalResponse.ToolCalls = toolCallInfos
				finalResponse.Intent = string(intent.Type)
				finalResponse.Confidence = intent.Confidence
			}
			break loop // 跳出外层 for 循环

		case TransitionRecover:
			// 进入恢复分支，继续循环
			log.Printf("[Agent] 进入恢复分支，继续循环")
			query = "" // 续写时不需要新 query
			continue

		case TransitionContinue:
			// 继续循环，下一轮不需要再次发送原始 query（历史记录中已包含）
			query = ""
			continue

		case TransitionInterrupt:
			// 用户中断
			log.Printf("[Agent] 用户中断")
			return nil, fmt.Errorf("用户中断")

		default:
			log.Printf("[Agent] 未知状态转移: %s", result.Transition)
			break loop // 跳出外层 for 循环
		}
	}

	// 7. 检查是否超过最大迭代次数
	if iterations >= maxIterations && finalResponse == nil {
		log.Printf("[Agent] [警告] 超过最大迭代次数 %d，QueryLoop 未返回响应，使用 RAG 兜底", maxIterations)
	}

	// 8. 如果 QueryLoop 没有返回响应，使用 RAG 流程兜底
	if finalResponse == nil {
		log.Printf("[Agent] QueryLoop 未返回响应，使用 RAG 流程兜底")
		answer, results, _, err := RAGAskWithHistory(query, session.Messages)
		if err != nil {
			return nil, err
		}
		finalResponse = a.buildResponse([]ToolResult{{Output: answer, Documents: results}}, toolCallInfos, intent, state.SessionID)
	}

	// 9. 更新上下文（使用完整的工具结果，包含 Documents）
	a.updateContext(session.Context, allToolResults, intent)

	// 10. 保存对话历史
	newSessionID, err := a.sessionManager.SaveTurn(session.ID, ConversationMessage{
		Role:      "user",
		Content:   originalQuery,
		Intent:    string(intent.Type),
		Timestamp: time.Now(),
	})
	if err != nil {
		log.Printf("[Agent] 保存用户消息失败: %v", err)
	}

	_, err = a.sessionManager.SaveTurn(newSessionID, ConversationMessage{
		Role:       "assistant",
		Content:    finalResponse.Content,
		References: extractDocIDsFromResponse(finalResponse),
		Intent:     string(intent.Type),
		Timestamp:  time.Now(),
	})
	if err != nil {
		log.Printf("[Agent] 保存助手消息失败: %v", err)
	}

	// 11. 更新会话上下文到数据库
	a.sessionManager.UpdateContext(newSessionID, session.Context)

	// 12. 检查是否需要压缩历史
	a.sessionManager.CompressHistory(newSessionID)

	finalResponse.SessionID = newSessionID

	log.Printf("[Agent] ========== 处理完成 ==========")
	log.Printf("[Agent] 会话ID: %d, 意图: %s, 置信度: %.2f", newSessionID, intent.Type, intent.Confidence)
	log.Printf("[Agent] 引用文档: %d 个, 工具调用: %d 次", len(finalResponse.References), len(finalResponse.ToolCalls))
	log.Printf("[Agent] 回复摘要: %q", truncateOutput(finalResponse.Content, 100))

	// 13. 异步反思对话并更新用户画像
	GetMemoryManager().ReflectOnConversation(session.Messages)

	return finalResponse, nil
}

// executeToolCalls 执行工具调用序列
func (a *Agent) executeToolCalls(state *QueryState) ([]ToolResult, []ToolCallInfo, bool) {
	log.Printf("[Agent] 执行工具调用序列: %d 个工具", len(state.ActiveToolCalls))
	results := make([]ToolResult, 0)
	infos := make([]ToolCallInfo, 0)
	hasError := false

	for i, call := range state.ActiveToolCalls {
		// 特殊逻辑：如果是保存笔记工具，且前面有执行结果，尝试继承内容
		if call.Tool == ToolSaveNote && i > 0 && results[i-1].Output != "" {
			if call.Parameters == nil {
				call.Parameters = make(map[string]interface{})
			}
			// 如果 content 为空，则取上一步的输出
			if content, ok := call.Parameters["content"].(string); !ok || content == "" {
				call.Parameters["content"] = results[i-1].Output
			}
			// 如果 title 为空，给一个默认值
			if title, ok := call.Parameters["title"].(string); !ok || title == "" {
				call.Parameters["title"] = "整理笔记_" + time.Now().Format("2006-01-02")
			}
		}

		log.Printf("[Agent] 工具[%d]: %s, 参数摘要: %v", i+1, call.Tool, summarizeParams(call.Parameters))
		result, info := a.toolExecutor.ExecuteWithTiming(i+1, call)
		results = append(results, result)
		infos = append(infos, info)

		// 检查是否执行失败
		if strings.Contains(result.Output, "失败") {
			log.Printf("[Agent] [警告] 工具[%d] 执行失败: %s", i+1, result.Output)
			hasError = true
			break
		}
		log.Printf("[Agent] 工具[%d] 完成: 耗时%dms, 输出摘要: %q", i+1, info.Duration, truncateOutput(result.Output, 50))
	}

	return results, infos, hasError
}

// summarizeParams 生成参数摘要（避免过长）
func summarizeParams(params map[string]interface{}) string {
	if params == nil {
		return "nil"
	}
	if len(params) == 0 {
		return "{}"
	}
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	return fmt.Sprintf("{%s}", strings.Join(keys, ","))
}

// truncateOutput 截断输出（避免日志过长）
func truncateOutput(output string, maxLen int) string {
	if len(output) <= maxLen {
		return output
	}
	return output[:maxLen] + "..."
}

// extractDocIDsFromResponse 从响应提取文档 ID
func extractDocIDsFromResponse(response *AgentResponse) []uint {
	ids := make([]uint, 0)
	for _, ref := range response.References {
		ids = append(ids, ref.DocumentID)
	}
	return ids
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
		if call.Tool == ToolSaveNote && i > 0 && results[i-1].Output != "" {
			call.Parameters["content"] = results[i-1].Output
			if call.Parameters["title"] == nil || call.Parameters["title"] == "" {
				call.Parameters["title"] = "整理笔记_" + time.Now().Format("2006-01-02")
			}
		}

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
			Tool: ToolSummarize,
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
			Tool: ToolSearch,
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
	case IntentRecord:
		return ToolSaveNote
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

func extractDocsFromResults(results []ToolResult) []SearchResult {
	docs := make([]SearchResult, 0)
	for _, result := range results {
		docs = append(docs, result.Documents...)
	}
	return uniqueSearchResults(docs)
}

// loadDocumentsByID 从数据库加载文档内容
func loadDocumentsByID(docIDs []uint) []SearchResult {
	if len(docIDs) == 0 {
		return nil
	}

	var notes []models.NoteItem
	global.DB.Where("id IN ? AND deleted_at IS NULL", docIDs).Find(&notes)

	results := make([]SearchResult, 0, len(notes))
	for _, note := range notes {
		results = append(results, SearchResult{
			NoteItem: note,
			Score:    1.0, // 已确认的文档，置信度高
		})
	}
	return results
}

// loadDocumentsByIDWithChunks 从数据库加载文档内容及其分片信息
func loadDocumentsByIDWithChunks(docIDs []uint) ([]SearchResult, map[uint][]ChunkSearchResult) {
	if len(docIDs) == 0 {
		return nil, nil
	}

	var notes []models.NoteItem
	global.DB.Where("id IN ? AND deleted_at IS NULL", docIDs).Find(&notes)

	results := make([]SearchResult, 0, len(notes))
	hitChunks := make(map[uint][]ChunkSearchResult)

	for _, note := range notes {
		results = append(results, SearchResult{
			NoteItem: note,
			Score:    1.0,
		})

		// 加载文档的所有分片（作为"命中分片"使用）
		var chunks []models.NoteChunk
		global.DB.Where("note_id = ?", note.ID).Order("chunk_index").Find(&chunks)
		for _, chunk := range chunks {
			hitChunks[note.ID] = append(hitChunks[note.ID], ChunkSearchResult{
				ChunkID:    chunk.ID,
				NoteID:     note.ID,
				Content:    chunk.Content,
				Heading:    chunk.Heading,
				ChunkIndex: chunk.ChunkIndex,
				Score:      1.0,
			})
		}
	}
	return results, hitChunks
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
		// 正确计算 rune 数量（中文字符）
		runes := []rune(summary)
		if len(runes) > 100 {
			summary = string(runes[:100]) + "..."
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

func cleanQueryForSearch(query string) string {
	jieba := synonym.GetJieba()
	if jieba == nil {
		// 回退到基础过滤
		fillers := []string{"查找一下", "搜索一下", "查询一下", "帮我找找", "有没有关于", "我想看下", "最近的", "的相关记录", "的所有文档"}
		result := query
		for _, f := range fillers {
			result = strings.ReplaceAll(result, f, "")
		}
		return strings.TrimSpace(result)
	}

	// 使用词性标注提取核心词，并尝试保留原始连接结构
	tags := jieba.Tag(query)

	// 定义干扰词性
	ignorePOS := map[string]bool{
		"uj": true, "ul": true, "p": true, "r": true, "m": true, "q": true,
		"c": true, "d": true, "f": true, "u": true, "w": true,
	}

	// 强制移除的常见动词和形容词
	stopWords := map[string]bool{
		"查找": true, "搜索": true, "查询": true, "显示": true, "找": true, "看": true, "输出": true,
		"最近": true, "一下": true, "帮我": true, "请": true, "有没有": true,
	}

	var sb strings.Builder
	lastWasFiltered := false

	for _, tag := range tags {
		parts := strings.Split(tag, "/")
		if len(parts) != 2 {
			continue
		}
		word := parts[0]
		pos := parts[1]

		// 过滤
		if ignorePOS[pos] || stopWords[word] {
			lastWasFiltered = true
			continue
		}

		// 额外的标点符号检查
		if pos == "x" && regexp.MustCompile(`[^\w\x{4e00}-\x{9fa5}]`).MatchString(word) {
			lastWasFiltered = true
			continue
		}

		// 如果前一个被过滤了，且当前不是第一个词，加个空格分隔（避免歧义）
		if lastWasFiltered && sb.Len() > 0 {
			sb.WriteString(" ")
		}
		sb.WriteString(word)
		lastWasFiltered = false
	}

	result := strings.TrimSpace(sb.String())
	if result == "" {
		return query // 兜底
	}

	log.Printf("[Agent] Query 清洗: %q -> %q", query, result)
	return result
}

// isQuestion 简单判断是否为疑问句
func isQuestion(query string) bool {
	query = strings.ToLower(query)
	questionMarkers := []string{"怎么", "如何", "什么", "吗", "呢", "能否", "为什么", "how", "what", "can", "why", "help"}
	for _, marker := range questionMarkers {
		if strings.Contains(query, marker) {
			return true
		}
	}
	return strings.HasSuffix(query, "?") || strings.HasSuffix(query, "？")
}
