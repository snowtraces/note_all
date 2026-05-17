package service

import (
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"note_all_backend/pkg"
)

// Transition 循环状态转移类型
type Transition string

const (
	TransitionContinue  Transition = "continue"  // 继续循环
	TransitionRecover   Transition = "recover"   // 进入恢复分支
	TransitionStop      Transition = "stop"      // 正常停止
	TransitionInterrupt Transition = "interrupt" // 用户中断
)

// StopReason LLM 响应停止原因
type StopReason string

const (
	StopReasonNormal    StopReason = "normal"     // 正常完成
	StopReasonMaxTokens StopReason = "max_tokens" // 输出截断
	StopReasonToolUse   StopReason = "tool_use"   // 需要调用工具
	StopReasonError     StopReason = "error"      // API 错误
)

// QueryState Query Loop 跨轮状态
type QueryState struct {
	SessionID            uint                   // 会话 ID
	Messages             []ConversationMessage  // 对话历史
	Context              *SessionContext        // 会话上下文
	TurnCount            int                    // 当前轮次计数
	RecoveryCount        int                    // 错误恢复计数
	HasAttemptedCompact  bool                   // 是否已尝试 compact
	HasAttemptedRecovery bool                   // 是否已尝试恢复
	LastStopReason       StopReason             // 上次停止原因
	ActiveToolCalls      []ToolCall             // 待执行工具调用
	LastOutput           string                 // 上次输出（用于续写）
	ToolResults          []ToolResult           // 累积的工具结果（含文档数据）
	ExecutedCalls        []ToolCall             // 已执行的工具调用记录（用于去重）
}

// NewQueryState 创建初始状态
func NewQueryState(sessionID uint, messages []ConversationMessage, context *SessionContext) *QueryState {
	return &QueryState{
		SessionID:            sessionID,
		Messages:             messages,
		Context:              context,
		TurnCount:            0,
		RecoveryCount:        0,
		HasAttemptedCompact:  false,
		HasAttemptedRecovery: false,
		LastStopReason:       StopReasonNormal,
		ActiveToolCalls:      nil,
		LastOutput:           "",
		ToolResults:          nil,
	}
}

// QueryLoopResult 循环执行结果
type QueryLoopResult struct {
	Response   *AgentResponse
	Transition Transition
	Error      error
}

// QueryLoop 主循环入口
func QueryLoop(state *QueryState, query string, systemPrompt string) QueryLoopResult {
	log.Printf("[QueryLoop] ───── 轮次 %d ─────", state.TurnCount+1)
	log.Printf("[QueryLoop] 输入: %q", query)

	// 1. 输入治理：检查 token 预算，决定是否需要 proactive compact
	if shouldProactiveCompact(state) {
		log.Printf("[QueryLoop] [预算] Token 预算告急，触发 proactive compact")
		if !performProactiveCompact(state) {
			// compact 失败，尝试截断
			log.Printf("[QueryLoop] [预算] Compact 失败，尝试截断")
			if !performTruncate(state) {
				// 截断也失败，熔断
				log.Printf("[QueryLoop] [熔断] 无法处理上下文过长")
				return QueryLoopResult{
					Response:   nil,
					Transition: TransitionStop,
					Error:      fmt.Errorf("上下文过长，无法继续"),
				}
			}
		}
	}

	// 2. 构建消息列表
	messages := buildMessagesForLLM(state, query)
	log.Printf("[QueryLoop] 构建消息: %d 条历史 + 当前输入", len(messages)-1)

	// 3. 调用 LLM（带流式处理，传入文档上下文）
	log.Printf("[QueryLoop] 调用 LLM...")
	llmResult := callLLMWithStreaming(messages, systemPrompt)

	// 4. 处理 LLM 响应
	log.Printf("[QueryLoop] LLM 响应: stop_reason=%s, output_len=%d", llmResult.StopReason, len(llmResult.Output))
	switch llmResult.StopReason {
	case StopReasonNormal:
		// 正常完成，构建响应
		return handleNormalStop(state, llmResult, query)

	case StopReasonMaxTokens:
		// 输出截断，进入续写恢复
		return handleMaxTokens(state, llmResult)

	case StopReasonToolUse:
		// 需要调用工具，执行后继续循环
		return handleToolUse(state, llmResult, query)

	case StopReasonError:
		// API 错误，进入错误恢复
		return handleError(state, llmResult.Error)

	default:
		return QueryLoopResult{
			Response:   nil,
			Transition: TransitionStop,
			Error:      fmt.Errorf("未知停止原因: %s", llmResult.StopReason),
		}
	}
}

// LLMResult LLM 调用结果
type LLMResult struct {
	Output     string      // 输出文本
	StopReason StopReason  // 停止原因
	ToolCalls  []ToolCall  // 工具调用请求
	Usage      TokenUsage  // Token 使用量
	Error      error       // 错误信息
}

// TokenUsage Token 使用统计
type TokenUsage struct {
	InputTokens  int
	OutputTokens int
	TotalTokens  int
}

// shouldProactiveCompact 检查是否需要 proactive compact
func shouldProactiveCompact(state *QueryState) bool {
	// 计算当前 token 使用量
	usage := estimateTokenUsage(state.Messages)

	// 预算阈值：模型窗口 - 输出预留 - 恢复预留
	maxTokens := getModelMaxTokens()
	reservedTokens := getReservedTokens()
	bufferTokens := getBufferTokens()

	threshold := maxTokens - reservedTokens - bufferTokens

	if usage > threshold {
		log.Printf("[QueryLoop] Token 预算告急: usage=%d, threshold=%d", usage, threshold)
		return true
	}

	return false
}

// performProactiveCompact 执行 proactive compact
func performProactiveCompact(state *QueryState) bool {
	if state.HasAttemptedCompact {
		log.Printf("[QueryLoop] 已尝试 compact，跳过")
		return false
	}

	state.HasAttemptedCompact = true

	// 调用 session manager 的压缩方法
	sm := NewSessionManager()
	if err := sm.CompressHistory(state.SessionID); err != nil {
		log.Printf("[QueryLoop] Proactive compact 失败: %v", err)
		return false
	}

	// 重新加载会话
	session, err := sm.LoadSession(state.SessionID)
	if err != nil {
		log.Printf("[QueryLoop] 重载会话失败: %v", err)
		return false
	}

	state.Messages = session.Messages
	log.Printf("[QueryLoop] Proactive compact 成功，消息数: %d", len(state.Messages))
	return true
}

// performTruncate 执行截断（降级策略）
func performTruncate(state *QueryState) bool {
	// 截断最早的 2 轮对话
	if len(state.Messages) <= 4 {
		log.Printf("[QueryLoop] 消息太少，无法截断")
		return false
	}

	// 保留最近 4 轮
	keepStart := len(state.Messages) - 4
	if keepStart < 0 {
		keepStart = 0
	}

	state.Messages = state.Messages[keepStart:]
	log.Printf("[QueryLoop] 截断成功，保留 %d 条消息", len(state.Messages))
	return true
}

// handleNormalStop 处理正常停止
func handleNormalStop(state *QueryState, llmResult LLMResult, query string) QueryLoopResult {
	log.Printf("[QueryLoop] [完成] LLM 正常返回，轮次=%d", state.TurnCount+1)

	// 构建响应（不保存消息，由 Agent 统一管理）
	response := &AgentResponse{
		Content:   llmResult.Output,
		SessionID: state.SessionID,
		Intent:    "normal",
	}

	// 消息保存由 Agent.Ask() 统一处理，避免重复
	// 将生成的消息加入状态，供 Agent 保存
	state.Messages = append(state.Messages, ConversationMessage{
		Role:      "assistant",
		Content:   llmResult.Output,
		Timestamp: time.Now(),
	})

	state.TurnCount++
	state.LastStopReason = StopReasonNormal

	log.Printf("[QueryLoop] ───── 轮次结束 ─────")
	return QueryLoopResult{
		Response:   response,
		Transition: TransitionStop,
		Error:      nil,
	}
}

// handleMaxTokens 处理输出截断
func handleMaxTokens(state *QueryState, llmResult LLMResult) QueryLoopResult {
	state.RecoveryCount++
	log.Printf("[QueryLoop] [截断] 输出被截断，进入续写恢复 (recovery=%d)", state.RecoveryCount)

	// 检查熔断阈值
	if state.RecoveryCount > MaxRecoveryAttempts {
		log.Printf("[QueryLoop] 达到熔断阈值，停止恢复")
		return QueryLoopResult{
			Response:   nil,
			Transition: TransitionStop,
			Error:      fmt.Errorf("输出截断，已达到恢复上限"),
		}
	}

	// 续写策略：保留已输出内容，请求继续
	state.LastOutput = llmResult.Output

	// 返回继续循环（下次调用会自动处理续写）
	return QueryLoopResult{
		Response:   nil,
		Transition: TransitionRecover,
		Error:      nil,
	}
}

// handleError 处理错误
func handleError(state *QueryState, err error) QueryLoopResult {
	state.RecoveryCount++

	// 检查熔断阈值
	if state.RecoveryCount > MaxRecoveryAttempts {
		log.Printf("[QueryLoop] 达到熔断阈值，停止恢复")
		return QueryLoopResult{
			Response:   nil,
			Transition: TransitionStop,
			Error:      err,
		}
	}

	// 判断错误类型
	if isPromptTooLong(err) {
		// prompt too long：尝试 compact 或 truncate
		if !state.HasAttemptedCompact {
			if performProactiveCompact(state) {
				return QueryLoopResult{
					Transition: TransitionRecover,
					Error:      nil,
				}
			}
		}

		// compact 失败，尝试截断
		if performTruncate(state) {
			return QueryLoopResult{
				Transition: TransitionRecover,
				Error:      nil,
			}
		}

		// 都失败，熔断
		return QueryLoopResult{
			Transition: TransitionStop,
			Error:      fmt.Errorf("prompt 太长，无法恢复"),
		}
	}

	// 其他错误：直接返回
	return QueryLoopResult{
		Transition: TransitionStop,
		Error:      err,
	}
}

// 辅助函数

func buildMessagesForLLM(state *QueryState, query string) []ConversationMessage {
	messages := make([]ConversationMessage, 0)

	// 复制历史消息
	for _, msg := range state.Messages {
		if msg.Role == "user" || msg.Role == "assistant" || msg.Role == "system" {
			messages = append(messages, msg)
		}
	}

	// 添加当前问题
	messages = append(messages, ConversationMessage{
		Role:      "user",
		Content:   query,
		Timestamp: time.Now(),
	})

	// 如果有续写需求，添加续写提示
	if state.LastOutput != "" {
		messages = append(messages, ConversationMessage{
			Role:      "system",
			Content:   "上次输出被截断，已输出内容：" + state.LastOutput + "\n请继续输出，不要重复。",
			Timestamp: time.Now(),
		})
	}

	// 处理工具结果（含文档），将分片内容作为消息传递
	if len(state.ToolResults) > 0 {
		docContext := buildDocumentContext(state.ToolResults)
		if docContext != "" {
			messages = append(messages, ConversationMessage{
				Role:      "user",
				Content:   "【参考笔记上下文】\n" + docContext + "\n【参考笔记上下文结束】",
				Timestamp: time.Now(),
			})
		}
	}

	return messages
}

// buildDocumentContext 从工具结果构建文档上下文（优先使用分片）
func buildDocumentContext(toolResults []ToolResult) string {
	var allDocs []SearchResult
	allHitChunks := make(map[uint][]ChunkSearchResult)
	for _, result := range toolResults {
		allDocs = append(allDocs, result.Documents...)
		for docID, chunks := range result.HitChunks {
			allHitChunks[docID] = append(allHitChunks[docID], chunks...)
		}
	}
	if len(allDocs) == 0 {
		return ""
	}
	// 优先使用分片上下文（更精简）
	if len(allHitChunks) > 0 {
		return BuildRAGContextFromChunks(allDocs, allHitChunks)
	}
	return BuildRAGContext(allDocs)
}

func callLLMWithStreaming(messages []ConversationMessage, systemPrompt string) LLMResult {
	// 转换消息格式
	llmMessages := make([]map[string]string, 0)
	for _, msg := range messages {
		llmMessages = append(llmMessages, map[string]string{
			"role":    msg.Role,
			"content": msg.Content,
		})
	}

	// 使用传入的 systemPrompt
	if systemPrompt == "" {
		systemPrompt = buildSystemPrompt()
	}

	// 计算输入 token 估算（使用 rune 计数）
	inputChars := utf8.RuneCountInString(systemPrompt)
	for _, msg := range messages {
		inputChars += utf8.RuneCountInString(msg.Content)
	}
	estimatedInputTokens := inputChars / 2 // 中文约 2 字符/token
	log.Printf("[QueryLoop] LLM 输入估算: %d chars ≈ %d tokens", inputChars, estimatedInputTokens)

	output, err := callLLM(llmMessages, systemPrompt)

	// 计算输出 token 估算
	estimatedOutputTokens := utf8.RuneCountInString(output) / 2
	log.Printf("[QueryLoop] LLM 输出估算: %d chars ≈ %d tokens", utf8.RuneCountInString(output), estimatedOutputTokens)

	if err != nil {
		return LLMResult{
			StopReason: StopReasonError,
			Error:      err,
		}
	}

	// 检查是否包含工具调用意图（简化判断）
	toolCalls := detectToolCalls(output)

	if len(toolCalls) > 0 {
		return LLMResult{
			Output:     output,
			StopReason: StopReasonToolUse,
			ToolCalls:  toolCalls,
		}
	}

	return LLMResult{
		Output:     output,
		StopReason: StopReasonNormal,
	}
}

func buildSystemPrompt() string {
	// 基础提示词（文档内容通过消息传递，不再嵌入 systemPrompt）
	return `你是一个专注于个人知识库的智能助手，同时具备深厚的通用知识储备。

请遵循以下规则：
1. 优先基于【参考笔记上下文】中的具体内容来回答用户问题
2. 不要给出空洞的"建议"、"思路"，而是提取具体信息直接回答
3. 如果文档内容能回答问题，直接给出答案，引用具体信息
4. 如果文档内容不足以回答问题，说明缺少什么信息
5. 使用简洁、深刻的口吻回复，支持 Markdown 格式`
}

func callLLM(messages []map[string]string, systemPrompt string) (string, error) {
	// 临时使用 pkg.AskAI，后续替换为流式版本
	return callLLMInternal(messages, systemPrompt)
}

// detectToolCalls 检测 LLM 输出中的工具调用意图 (ReAct 模式)
func detectToolCalls(output string) []ToolCall {
	// 匹配格式: Action: ToolName({"key": "value"})
	// 支持中英文关键字 (Action/行动)、Markdown 加粗以及中英文冒号 (:)
	// 同时也支持 XML 样式的参数包裹（容错性）
	re := regexp.MustCompile(`(?i)(?:\*\*)?(?:Action|行动)(?:\*\*)?[:：](?:\*\*)?\s*(\w+)\s*[(\<]([\s\S]*?)[)\>]`)
	matches := re.FindAllStringSubmatch(output, -1)

	var calls []ToolCall
	for _, match := range matches {
		if len(match) >= 3 {
			toolNameStr := strings.TrimSpace(match[1])
			paramJSON := strings.TrimSpace(match[2])
			
			// 清理 JSON：移除可能存在的 Markdown 代码块包裹
			paramJSON = strings.TrimPrefix(paramJSON, "```json")
			paramJSON = strings.TrimPrefix(paramJSON, "```")
			paramJSON = strings.TrimSuffix(paramJSON, "```")
			paramJSON = strings.TrimSpace(paramJSON)

			log.Printf("[QueryLoop] 检测到工具调用意图: %s, 参数: %s", toolNameStr, paramJSON)

			// 容错处理：如果不是 JSON，尝试寻找其中包含的 JSON 块
			if paramJSON != "" && !strings.HasPrefix(paramJSON, "{") {
				reJSON := regexp.MustCompile(`\{[\s\S]*\}`)
				if jsonMatch := reJSON.FindString(paramJSON); jsonMatch != "" {
					paramJSON = jsonMatch
				}
			}

			var params map[string]interface{}
			if paramJSON == "" || paramJSON == "{}" {
				params = make(map[string]interface{})
			} else {
				if err := json.Unmarshal([]byte(paramJSON), &params); err != nil {
					// 容错处理：如果依然解析失败，但看起来像是由于非贪婪匹配截断导致的
					// 我们尝试在整个 output 中寻找从匹配点开始到最后一个 ) 的内容
					log.Printf("[QueryLoop] JSON 解析失败: %v, 尝试扩大范围解析...", err)
					
					// 如果解析失败，且内容包含 { 但不平衡，尝试寻找完整的 JSON 块
					if strings.Contains(paramJSON, "{") {
						// 寻找当前工具名后的第一个 {
						toolStart := strings.Index(output, toolNameStr)
						if toolStart != -1 {
							remaining := output[toolStart:]
							jsonStart := strings.Index(remaining, "{")
							if jsonStart != -1 {
								// 使用括号计数寻找匹配的 }
								count := 0
								found := false
								jsonEnd := -1
								for i := jsonStart; i < len(remaining); i++ {
									if remaining[i] == '{' {
										count++
									} else if remaining[i] == '}' {
										count--
										if count == 0 {
											jsonEnd = i + 1
											found = true
											break
										}
									}
								}
								
								if found {
									extendedJSON := strings.TrimSpace(remaining[jsonStart:jsonEnd])
									if err2 := json.Unmarshal([]byte(extendedJSON), &params); err2 == nil {
										log.Printf("[QueryLoop] 括号计数解析成功!")
										paramJSON = extendedJSON
									}
								}
							}
						}
					}

					// 如果还是失败，尝试寻找最后一个 ) 或 > 作为边界（容错旧模式）
					if params == nil {
						toolStart := strings.Index(output, toolNameStr)
						if toolStart != -1 {
							remaining := output[toolStart:]
							bracketStart := strings.IndexAny(remaining, "(<")
							bracketEnd := strings.LastIndexAny(remaining, ")>")
							if bracketStart != -1 && bracketEnd != -1 && bracketEnd > bracketStart {
								potentialJSON := strings.TrimSpace(remaining[bracketStart+1 : bracketEnd])
								potentialJSON = strings.TrimPrefix(potentialJSON, "```json")
								potentialJSON = strings.TrimPrefix(potentialJSON, "```")
								potentialJSON = strings.TrimSuffix(potentialJSON, "```")
								potentialJSON = strings.TrimSpace(potentialJSON)
								if err3 := json.Unmarshal([]byte(potentialJSON), &params); err3 == nil {
									log.Printf("[QueryLoop] 边界匹配解析成功!")
									paramJSON = potentialJSON
								}
							}
						}
					}

					// 如果最终还是失败，且不是 save_note，则执行兜底包装
					if params == nil {
						log.Printf("[QueryLoop] 参数非 JSON 格式且无法自动修复，尝试自动包装为 query: %q", paramJSON)
						params = map[string]interface{}{"query": paramJSON}
					}
				}
			}

			calls = append(calls, ToolCall{
				Tool:       Tool(strings.ToLower(toolNameStr)),
				Parameters: params,
			})
		}
	}
	if len(calls) == 0 && strings.Contains(output, "Action:") {
		log.Printf("[QueryLoop] 警告: 输出包含 Action: 关键字但未匹配到有效工具调用。输出片段: %q", truncateOutput(output, 100))
	}
	
	return calls
}

// handleToolUse 处理工具调用
// TODO: 待完善 - 需要支持 LLM 自主决定调用工具的场景
func handleToolUse(state *QueryState, llmResult LLMResult, query string) QueryLoopResult {
	// 执行工具
	toolExecutor := NewToolExecutor()
	var toolResults []ToolResult
	var toolCallInfos []ToolCallInfo

	for i, toolCall := range llmResult.ToolCalls {
		result, info := toolExecutor.ExecuteWithTiming(i+1, toolCall, nil)
		toolResults = append(toolResults, result)
		toolCallInfos = append(toolCallInfos, info)

		// 检查是否执行失败
		if strings.Contains(result.Output, "失败") {
			log.Printf("[QueryLoop] 工具 [%d] 执行失败，中断后续", i)
			break
		}
	}

	// 1. 将 LLM 的输出（包含 Thought 和 Action）加入消息历史
	state.Messages = append(state.Messages, ConversationMessage{
		Role:      "assistant",
		Content:   llmResult.Output,
		Timestamp: time.Now(),
	})

	// 2. 将工具结果加入消息（使用 user 角色 + 前缀，兼容 API）
	for _, result := range toolResults {
		toolResultMsg := ConversationMessage{
			Role:      "user",
			Content:   "[工具执行结果]\n" + result.Output,
			Timestamp: time.Now(),
		}
		state.Messages = append(state.Messages, toolResultMsg)
	}

	state.ActiveToolCalls = nil
	state.TurnCount++

	// 检查是否有工具执行失败，如果失败则停止循环
	for _, result := range toolResults {
		if strings.Contains(result.Output, "失败") {
			log.Printf("[QueryLoop] 检测到工具执行失败，停止循环并输出错误")
			return QueryLoopResult{
				Response:   nil, // 由 Agent.Ask 构建最终响应
				Transition: TransitionStop,
				Error:      nil,
			}
		}
	}

	// 继续循环，请求 LLM 处理工具结果
	return QueryLoopResult{
		Response:   nil,
		Transition: TransitionContinue,
		Error:      nil,
	}
}

// estimateTokenUsage 估算 token 使用量
func estimateTokenUsage(messages []ConversationMessage) int {
	// 简化估算：字符数 / 4（中文约 2 字符/token）
	totalChars := 0
	for _, msg := range messages {
		totalChars += len(msg.Content)
	}
	return totalChars / 2 // 简化估算
}

func getModelMaxTokens() int {
	return 32000 // 模型窗口上限
}

func getReservedTokens() int {
	return 8000 // 输出预留
}

func getBufferTokens() int {
	return 4000 // 恢复预留
}

func isPromptTooLong(err error) bool {
	// 检查错误信息是否包含 prompt too long
	if err == nil {
		return false
	}
	errMsg := err.Error()
	return strings.Contains(errMsg, "prompt too long") ||
		strings.Contains(errMsg, "context_length_exceeded") ||
		strings.Contains(errMsg, "too long")
}

func saveConversationTurn(state *QueryState, query string, output string) {
	sm := NewSessionManager()

	// 保存用户消息
	sm.SaveTurn(state.SessionID, ConversationMessage{
		Role:      "user",
		Content:   query,
		Intent:    "",
		Timestamp: time.Now(),
	})

	// 保存助手消息
	sm.SaveTurn(state.SessionID, ConversationMessage{
		Role:      "assistant",
		Content:   output,
		Intent:    "",
		Timestamp: time.Now(),
	})
}

// MaxRecoveryAttempts 最大恢复尝试次数
const MaxRecoveryAttempts = 3

// callLLMInternal 内部 LLM 调用（独立接口，不依赖 RAG）
func callLLMInternal(messages []map[string]string, systemPrompt string) (string, error) {
	// 直接使用 pkg.AskAI
	return pkg.AskAI(messages, systemPrompt)
}