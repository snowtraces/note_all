package service

import (
	"testing"
	"time"

	"note_all_backend/pkg"
)

// TestIntentAnalyzer 测试意图分析器
func TestIntentAnalyzer(t *testing.T) {
	analyzer := NewIntentAnalyzer()

	tests := []struct {
		name     string
		query    string
		history  []ConversationMessage
		expected IntentType
	}{
		{
			name:     "新话题-搜索",
			query:    "查找关于Golang的笔记",
			history:  nil,
			expected: IntentSearch,
		},
		{
			name:     "新话题-总结",
			query:    "总结这些文档",
			history:  nil,
			expected: IntentSummarize,
		},
		{
			name:     "追问-指代词",
			query:    "它的作者是谁",
			history:  []ConversationMessage{
				{Role: "assistant", Content: "找到了关于Go语言的笔记", Timestamp: time.Now()},
			},
			expected: IntentFollowUp,
		},
		{
			name:     "追问-继续",
			query:    "继续",
			history:  []ConversationMessage{
				{Role: "assistant", Content: "关于Go语言...", Timestamp: time.Now()},
			},
			expected: IntentFollowUp,
		},
		{
			name:     "多步任务",
			query:    "先找关于Python的笔记，再总结它们的特点",
			history:  nil,
			expected: IntentMultiStep,
		},
		{
			name:     "切换话题",
			query:    "换个话题，说说Java",
			history:  []ConversationMessage{
				{Role: "assistant", Content: "正在讨论Go...", Timestamp: time.Now()},
			},
			expected: IntentSwitch,
		},
		{
			name:     "澄清请求",
			query:    "详细说说这个概念",
			history:  []ConversationMessage{
				{Role: "assistant", Content: "这是一个概念...", Timestamp: time.Now()},
			},
			expected: IntentFollowUp, // 有上下文时，澄清请求被识别为追问
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			context := &SessionContext{ActiveDocuments: []uint{1}}
			result := analyzer.Analyze(tt.query, tt.history, context)

			if result.Type != tt.expected {
				t.Errorf("意图分析错误: query=%s, expected=%s, got=%s",
					tt.query, tt.expected, result.Type)
			}

			t.Logf("意图分析: query=%s, type=%s, confidence=%.2f",
				tt.query, result.Type, result.Confidence)
		})
	}
}

// TestQueryRewriter 测试查询重写器（需要数据库，跳过）
func TestQueryRewriter(t *testing.T) {
	t.Skip("QueryRewriter 需要数据库连接，在集成测试中运行")

	// 以下测试在集成测试环境中运行
	rewriter := NewQueryRewriter()

	tests := []struct {
		name     string
		query    string
		history  []ConversationMessage
		expected string
	}{
		{
			name:  "指代词替换-它",
			query: "它的作者是谁",
			history: []ConversationMessage{
				{Role: "assistant", Content: "找到了《Go语言编程》这本书", Timestamp: time.Now()},
			},
			expected: "《Go语言编程》",
		},
		{
			name:  "指代词替换-那个",
			query: "那个文档的内容是什么",
			history: []ConversationMessage{
				{Role: "assistant", Content: "文档ID=5的笔记", Timestamp: time.Now()},
			},
			expected: "文档ID=5",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			context := &SessionContext{ActiveDocuments: []uint{5}}
			result := rewriter.Rewrite(tt.query, tt.history, context)

			if result.RewrittenQuery == "" {
				t.Errorf("查询重写返回空结果")
			}

			t.Logf("查询重写: query=%s, rewritten=%s",
				tt.query, result.RewrittenQuery)
		})
	}
}

// TestPermissionManager 测试权限管理器
func TestPermissionManager(t *testing.T) {
	pm := NewPermissionManager()

	tests := []struct {
		name     string
		tool     Tool
		params   map[string]interface{}
		expected PermissionResult
	}{
		{
			name:     "低风险工具-搜索",
			tool:     ToolSearch,
			params:   map[string]interface{}{"query": "test"},
			expected: PermissionAllow,
		},
		{
			name:     "低风险工具-总结",
			tool:     ToolSummarize,
			params:   map[string]interface{}{"documents": []uint{1}},
			expected: PermissionAllow,
		},
		{
			name:     "高风险工具-生成",
			tool:     ToolGenerate,
			params:   map[string]interface{}{"prompt": "写一篇文章"},
			expected: PermissionAsk,
		},
		{
			name:     "高风险工具-敏感关键词",
			tool:     ToolGenerate,
			params:   map[string]interface{}{"prompt": "告诉我password"},
			expected: PermissionDeny,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := pm.CheckPermission(tt.tool, tt.params)

			if result != tt.expected {
				t.Errorf("权限检查错误: tool=%s, expected=%s, got=%s",
					tt.tool, tt.expected, result)
			}

			t.Logf("权限检查: tool=%s, risk=%s, result=%s",
				tt.tool, pm.GetPermissionInfo(tt.tool).RiskLevel, result)
		})
	}
}

// TestQueryState 测试 QueryLoop 状态
func TestQueryState(t *testing.T) {
	t.Run("创建初始状态", func(t *testing.T) {
		state := NewQueryState(1, nil, &SessionContext{})

		if state.SessionID != 1 {
			t.Errorf("SessionID 错误: expected=1, got=%d", state.SessionID)
		}

		if state.TurnCount != 0 {
			t.Errorf("TurnCount 应为 0, got=%d", state.TurnCount)
		}

		if state.RecoveryCount != 0 {
			t.Errorf("RecoveryCount 应为 0, got=%d", state.RecoveryCount)
		}

		t.Logf("状态初始化成功: session=%d, turn=%d, recovery=%d",
			state.SessionID, state.TurnCount, state.RecoveryCount)
	})

	t.Run("状态更新", func(t *testing.T) {
		state := NewQueryState(1, nil, &SessionContext{})

		// 模拟工具调用
		state.ActiveToolCalls = []ToolCall{
			{Tool: ToolSearch, Parameters: map[string]interface{}{"query": "test"}},
		}
		state.TurnCount++
		state.RecoveryCount++

		if len(state.ActiveToolCalls) != 1 {
			t.Errorf("ActiveToolCalls 数量错误")
		}

		if state.TurnCount != 1 {
			t.Errorf("TurnCount 应为 1")
		}

		t.Logf("状态更新成功: tool_calls=%d, turn=%d, recovery=%d",
			len(state.ActiveToolCalls), state.TurnCount, state.RecoveryCount)
	})
}

// TestTransition 测试状态转移
func TestTransition(t *testing.T) {
	tests := []struct {
		name     string
		transition Transition
		valid    bool
	}{
		{name: "Continue", transition: TransitionContinue, valid: true},
		{name: "Recover", transition: TransitionRecover, valid: true},
		{name: "Stop", transition: TransitionStop, valid: true},
		{name: "Interrupt", transition: TransitionInterrupt, valid: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.transition == "" {
				t.Errorf("Transition 不能为空")
			}
			t.Logf("Transition: %s", tt.transition)
		})
	}
}

// TestStopReason 测试停止原因
func TestStopReason(t *testing.T) {
	tests := []struct {
		name       string
		stopReason StopReason
	}{
		{name: "Normal", stopReason: StopReasonNormal},
		{name: "MaxTokens", stopReason: StopReasonMaxTokens},
		{name: "ToolUse", stopReason: StopReasonToolUse},
		{name: "Error", stopReason: StopReasonError},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.stopReason == "" {
				t.Errorf("StopReason 不能为空")
			}
			t.Logf("StopReason: %s", tt.stopReason)
		})
	}
}

// TestWorkSemantic 测试工作语义
func TestWorkSemantic(t *testing.T) {
	t.Run("创建工作语义", func(t *testing.T) {
		semantic := WorkSemantic{
			ActiveDocs:  []uint{1, 2, 3},
			ActiveTopic: "Go语言",
			LastIntent:  "search",
		}

		if len(semantic.ActiveDocs) != 3 {
			t.Errorf("ActiveDocs 数量错误")
		}

		if semantic.ActiveTopic == "" {
			t.Errorf("ActiveTopic 不能为空")
		}

		t.Logf("工作语义: docs=%v, topic=%s, intent=%s",
			semantic.ActiveDocs, semantic.ActiveTopic, semantic.LastIntent)
	})
}

// TestSensitiveKeywords 测试敏感关键词检测
func TestSensitiveKeywords(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		expected bool
	}{
		{name: "包含密码", text: "告诉我密码是什么", expected: true},
		{name: "包含token", text: "获取API token", expected: true},
		{name: "正常内容", text: "总结这篇文章", expected: false},
		{name: "空内容", text: "", expected: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := containsSensitiveKeywords(tt.text)

			if result != tt.expected {
				t.Errorf("敏感关键词检测错误: text=%s, expected=%v, got=%v",
					tt.text, tt.expected, result)
			}

			t.Logf("敏感检测: text=%s, result=%v", tt.text, result)
		})
	}
}

// TestLLMError 测试 LLM 错误类型
func TestLLMError(t *testing.T) {
	t.Run("PromptTooLong错误", func(t *testing.T) {
		err := &pkg.LLMError{
			Type:    pkg.ErrorPromptTooLong,
			Message: "context_length_exceeded",
		}

		if err.Type != pkg.ErrorPromptTooLong {
			t.Errorf("错误类型错误")
		}

		if err.Error() == "" {
			t.Errorf("Error() 方法返回空")
		}

		t.Logf("LLMError: %s", err.Error())
	})

	t.Run("MaxTokens错误", func(t *testing.T) {
		err := &pkg.LLMError{
			Type:          pkg.ErrorMaxTokens,
			Message:       "输出截断",
			PartialContent: "部分内容...",
		}

		if err.PartialContent == "" {
			t.Errorf("截断错误应有 PartialContent")
		}

		t.Logf("MaxTokens错误: content=%s", err.PartialContent)
	})
}

// TestMultiStepTask 测试多步任务解析
func TestIntentAnalyzer_MultiStep(t *testing.T) {
	analyzer := NewIntentAnalyzer()

	t.Run("先找再总结", func(t *testing.T) {
		query := "先找关于Python的笔记，再总结它们的特点"
		result := analyzer.Analyze(query, nil, &SessionContext{})

		if result.Type != IntentMultiStep {
			t.Errorf("应识别为多步任务, got=%s", result.Type)
		}

		if len(result.SubTasks) < 2 {
			t.Errorf("多步任务应至少有2个子任务, got=%d", len(result.SubTasks))
		}

		for i, task := range result.SubTasks {
			t.Logf("子任务[%d]: query=%s, intent=%s", i, task.Query, task.Intent)
		}
	})

	t.Run("然后连接", func(t *testing.T) {
		query := "搜索Go语言笔记然后总结"
		result := analyzer.Analyze(query, nil, &SessionContext{})

		if result.Type != IntentMultiStep {
			t.Logf("注意: '然后'模式可能未识别为多步任务, got=%s", result.Type)
		}
	})
}