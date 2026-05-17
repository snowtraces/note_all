package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"note_all_backend/global"
)

// setupMockLLMServer 启动一个用于意图识别测试的模拟大模型 HTTP 服务
func setupMockLLMServer(t *testing.T) *httptest.Server {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 校验请求
		var reqBody struct {
			Messages []struct {
				Content string `json:"content"`
				Role    string `json:"role"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		userQuery := ""
		// 第0条是 system prompt，第1条是 user query (包含意图识别的 prompt 模板)
		if len(reqBody.Messages) > 1 {
			userQuery = reqBody.Messages[1].Content
		}

		// 提取出真正被 %s 替换的用户输入
		actualInput := userQuery
		if idx := strings.LastIndex(userQuery, "用户当前输入："); idx != -1 {
			actualInput = userQuery[idx+len("用户当前输入："):]
		} else if idx := strings.LastIndex(userQuery, "用户输入："); idx != -1 {
			actualInput = userQuery[idx+len("用户输入："):]
		}

		intent := "new_topic"
		lowerQuery := strings.ToLower(strings.TrimSpace(actualInput))

		// 1. 场景对话智能意图推理：若上一轮 AI 助手的引导选项或问题包含了用户当前的简短输入，则判定为选项选择或澄清响应
		isMultiTurnClarify := false
		if idxAssistant := strings.LastIndex(userQuery, "[assistant]:"); idxAssistant != -1 {
			assistantSnippet := userQuery[idxAssistant:]
			endIdx := len(assistantSnippet)
			if idxNextUser := strings.Index(assistantSnippet, "[user]"); idxNextUser != -1 {
				endIdx = idxNextUser
			}
			if idxInputPrefix := strings.Index(assistantSnippet, "用户当前输入："); idxInputPrefix != -1 && idxInputPrefix < endIdx {
				endIdx = idxInputPrefix
			}
			if idxInputPrefix2 := strings.Index(assistantSnippet, "用户输入："); idxInputPrefix2 != -1 && idxInputPrefix2 < endIdx {
				endIdx = idxInputPrefix2
			}
			assistantSnippet = assistantSnippet[:endIdx]

			if strings.Contains(assistantSnippet, "具体内容如：") || strings.Contains(assistantSnippet, "你可以：") || strings.Contains(assistantSnippet, "请") || strings.Contains(assistantSnippet, "确认") {
				if strings.Contains(assistantSnippet, lowerQuery) && len(lowerQuery) > 0 && len(lowerQuery) < 20 {
					intent = "follow_up"
					isMultiTurnClarify = true
				}
			}
		}

		// 2. 静态匹配规则
		if isMultiTurnClarify {
			// 已被多轮澄清选择场景命中
		} else if containsAny(lowerQuery, "你是谁", "谢谢", "hi", "你好", "天气", "名叫什么", "名字", "中文") {
			intent = "free_chat"
		} else if containsAny(lowerQuery, "检索", "查", "搜索", "找", "定位") {
			intent = "search"
		} else if containsAny(lowerQuery, "总结", "归纳", "要点", "提炼") {
			intent = "summarize"
		} else if containsAny(lowerQuery, "对比", "不同", "区别", "比较") {
			intent = "compare"
		} else if containsAny(lowerQuery, "写", "创作", "生成", "起草") {
			intent = "generate"
		} else if containsAny(lowerQuery, "整理成列表", "表格化") {
			intent = "follow_up"
		} else if containsAny(lowerQuery, "记", "存", "备忘") {
			intent = "record"
		}

		responseContent := `{
			"intent": "` + intent + `",
			"confidence": 0.95,
			"reason": "Mock LLM Result"
		}`

		// 返回 OpenAI 风格的 JSON
		resp := map[string]interface{}{
			"choices": []map[string]interface{}{
				{
					"message": map[string]string{
						"content": responseContent,
					},
					"finish_reason": "stop",
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))

	return server
}

func containsAny(s string, keywords ...string) bool {
	for _, kw := range keywords {
		if strings.Contains(s, kw) {
			return true
		}
	}
	return false
}

// TestIntentAnalyzer_Comprehensive 全面测试 7 大核心意图类型及其规则
func TestIntentAnalyzer_Comprehensive(t *testing.T) {
	// 启动 Mock 大模型服务
	server := setupMockLLMServer(t)
	defer server.Close()

	// 备份全局配置并注入 Mock 地址
	oldConfig := global.Config
	defer func() {
		global.Config = oldConfig
	}()

	global.Config.LlmApiUrl = server.URL
	global.Config.LlmApiToken = "mock_token"
	global.Config.LlmModelID = "mock_model"
	global.Config.LlmMaxOutputTokens = 8192

	analyzer := NewIntentAnalyzer()

	// 1. 测试 FreeChat (随意闲聊)
	t.Run("FreeChat", func(t *testing.T) {
		queries := []string{
			"你好啊，你是谁？",
			"谢谢你！",
			"哈喽哈喽，今天天气真好",
			"你的中文名叫什么",
			"hi",
		}
		for _, q := range queries {
			result := analyzer.Analyze(q, nil, &SessionContext{})
			if result.Type != IntentFreeChat {
				t.Errorf("意图识别错误: query=%s, expected=%s, got=%s", q, IntentFreeChat, result.Type)
			} else {
				t.Logf("✓ 成功识别 FreeChat: %s (置信度: %.2f)", q, result.Confidence)
			}
		}
	})

	// 2. 测试 Search (检索文档)
	t.Run("Search", func(t *testing.T) {
		queries := []string{
			"帮我检索关于Golang并发的笔记",
			"查一下昨天的报告",
			"搜索人工智能的发展史",
			"定位包含MySQL的文档",
		}
		for _, q := range queries {
			result := analyzer.Analyze(q, nil, &SessionContext{})
			if result.Type != IntentSearch {
				t.Errorf("意图识别错误: query=%s, expected=%s, got=%s", q, IntentSearch, result.Type)
			} else {
				t.Logf("✓ 成功识别 Search: %s (置信度: %.2f)", q, result.Confidence)
			}
		}
	})

	// 3. 测试 Summarize (总结归纳)
	t.Run("Summarize", func(t *testing.T) {
		queries := []string{
			"总结一下这些文章的大意",
			"提炼这篇文档的要点",
			"归纳梳理一下刚才的讨论",
		}
		for _, q := range queries {
			result := analyzer.Analyze(q, nil, &SessionContext{})
			if result.Type != IntentSummarize {
				t.Errorf("意图识别错误: query=%s, expected=%s, got=%s", q, IntentSummarize, result.Type)
			} else {
				t.Logf("✓ 成功识别 Summarize: %s (置信度: %.2f)", q, result.Confidence)
			}
		}
	})

	// 4. 测试 Compare (对比分析)
	t.Run("Compare", func(t *testing.T) {
		queries := []string{
			"对比这两份合同 the difference",
			"React和Vue有什么不同？",
			"比较这三种技术方案的相同点",
		}
		for _, q := range queries {
			result := analyzer.Analyze(q, nil, &SessionContext{})
			if result.Type != IntentCompare {
				t.Errorf("意图识别错误: query=%s, expected=%s, got=%s", q, IntentCompare, result.Type)
			} else {
				t.Logf("✓ 成功识别 Compare: %s (置信度: %.2f)", q, result.Confidence)
			}
		}
	})

	// 5. 测试 Generate (内容生成)
	t.Run("Generate", func(t *testing.T) {
		queries := []string{
			"帮我写一份周报报告",
			"创作一首关于春天的诗",
			"生成一个Go语言的Web服务大纲",
		}
		for _, q := range queries {
			result := analyzer.Analyze(q, nil, &SessionContext{})
			if result.Type != IntentGenerate {
				t.Errorf("意图识别错误: query=%s, expected=%s, got=%s", q, IntentGenerate, result.Type)
			} else {
				t.Logf("✓ 成功识别 Generate: %s (置信度: %.2f)", q, result.Confidence)
			}
		}
	})

	// 6. 测试 Record (记录随手记)
	t.Run("Record", func(t *testing.T) {
		queries := []string{
			"记一下，明天下午两点开会",
			"存一下：买牛奶和面包",
			"备忘录：今天学习了Go单元测试",
		}
		for _, q := range queries {
			result := analyzer.Analyze(q, nil, &SessionContext{})
			if result.Type != IntentRecord {
				t.Errorf("意图识别错误: query=%s, expected=%s, got=%s", q, IntentRecord, result.Type)
			} else {
				t.Logf("✓ 成功识别 Record: %s (置信度: %.2f)", q, result.Confidence)
			}
		}
	})

	// 7. 测试 FollowUp (指代与操作追问，对应 LLM 中的 follow_up)
	t.Run("FollowUp", func(t *testing.T) {
		history := []ConversationMessage{
			{Role: "user", Content: "查找合同", Timestamp: time.Now()},
			{Role: "assistant", Content: "找到5篇合同相关文档...", Timestamp: time.Now()},
		}
		context := &SessionContext{
			ActiveDocuments: []uint{1, 2, 3},
			ActiveTopic:     "合同",
			LastIntent:      "search",
		}

		tests := []struct {
			query    string
			expected IntentType
		}{
			{"它的作者是谁", IntentFollowUp},
			{"表格化列出核心信息", IntentFollowUp},
			{"整理成列表", IntentFollowUp},
			{"继续", IntentFollowUp},
		}

		for _, tt := range tests {
			result := analyzer.Analyze(tt.query, history, context)
			if result.Type != tt.expected {
				t.Errorf("意图识别错误: query=%s, expected=%s, got=%s", tt.query, tt.expected, result.Type)
			} else {
				t.Logf("✓ 成功识别 FollowUp 场景 [%s] -> %s (置信度: %.2f)", tt.query, result.Type, result.Confidence)
			}
		}
	})
}

// TestIntentAnalyzer_MultiTurnContext 测试复杂的多轮对话澄清与选择场景，手动重现并验证类似 149 会话的历史上下文意图识别
func TestIntentAnalyzer_MultiTurnContext(t *testing.T) {
	// 启动 Mock 大模型服务
	server := setupMockLLMServer(t)
	defer server.Close()

	// 备份全局配置并注入 Mock 地址
	oldConfig := global.Config
	defer func() {
		global.Config = oldConfig
	}()

	global.Config.LlmApiUrl = server.URL
	global.Config.LlmApiToken = "mock_token"
	global.Config.LlmModelID = "mock_model"
	global.Config.LlmMaxOutputTokens = 8192

	analyzer := NewIntentAnalyzer()

	// 准备几组不同场景下的多轮历史与上下文数据
	
	// 场景 A：149 类型的未找到文档新建引导场景
	historyGo := []ConversationMessage{
		{
			Role:      "user",
			Content:   "search notes about Go language",
			Intent:    "search",
			Timestamp: time.Now().Add(-2 * time.Minute),
		},
		{
			Role:      "assistant",
			Content:   "目前知识库中没有找到关于 Go 语言的笔记。不过，你可以让我帮你新建，具体内容如：面试/学习笔记、基础语法。请问你想怎么处理？",
			Intent:    "record",
			Timestamp: time.Now().Add(-1 * time.Minute),
		},
	}
	contextEmpty := &SessionContext{
		ActiveDocuments: []uint{},
		ActiveTopic:     "Go语言",
		LastIntent:      "record",
	}

	// 场景 B：删除确认场景
	historyDelete := []ConversationMessage{
		{
			Role:      "user",
			Content:   "帮我删除这篇 Docker 部署笔记",
			Intent:    "delete",
			Timestamp: time.Now().Add(-2 * time.Minute),
		},
		{
			Role:      "assistant",
			Content:   "确认要删除吗？该操作不可逆，请回答“确认”或“取消”。",
			Intent:    "delete",
			Timestamp: time.Now().Add(-1 * time.Minute),
		},
	}
	contextActive := &SessionContext{
		ActiveDocuments: []uint{99},
		ActiveTopic:     "Docker部署",
		LastIntent:      "delete",
	}

	// 场景 C：基于特定主题的指代性多轮追问
	historyPython := []ConversationMessage{
		{
			Role:      "user",
			Content:   "查找关于 Python 垃圾回收的笔记",
			Intent:    "search",
			Timestamp: time.Now().Add(-2 * time.Minute),
		},
		{
			Role:      "assistant",
			Content:   "为您找到 1 篇文档。Python 的垃圾回收主要依赖引用计数器，并配合标记清除和分代回收来解决循环引用问题。",
			Intent:    "search",
			Timestamp: time.Now().Add(-1 * time.Minute),
		},
	}

	tests := []struct {
		name           string
		query          string
		history        []ConversationMessage
		context        *SessionContext
		expectedIntent IntentType
	}{
		{
			name:           "正向测试1：回应新笔记创建引导的第一个选项",
			query:          "面试/学习笔记",
			history:        historyGo,
			context:        contextEmpty,
			expectedIntent: IntentFollowUp,
		},
		{
			name:           "正向测试2：回应新笔记创建引导的第二个选项",
			query:          "基础语法",
			history:        historyGo,
			context:        contextEmpty,
			expectedIntent: IntentFollowUp,
		},
		{
			name:           "正向测试3：多轮对话中的确认响应(Yes/No澄清)",
			query:          "确认",
			history:        historyDelete,
			context:        contextActive,
			expectedIntent: IntentFollowUp,
		},
		{
			name:           "正向测试4：多轮追问中的指代词检测(ContainsReference)",
			query:          "那它是怎么解决循环引用的呢？",
			history:        historyPython,
			context:        contextActive,
			expectedIntent: IntentFollowUp,
		},
		{
			name:           "负向测试5：多轮引导下输入非选项的杂乱日常话语",
			query:          "今天天气不错",
			history:        historyGo,
			context:        contextEmpty,
			expectedIntent: IntentFreeChat,
		},
		{
			name:           "负向测试6：多轮环境下用户强制切入新的生成型指令",
			query:          "帮我写一篇关于春天的诗",
			history:        historyPython,
			context:        contextActive,
			expectedIntent: IntentGenerate,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := analyzer.Analyze(tt.query, tt.history, tt.context)
			if result.Type != tt.expectedIntent {
				t.Errorf("场景对话多轮意图识别错误: query=%s, expected=%s, got=%s",
					tt.query, tt.expectedIntent, result.Type)
			} else {
				t.Logf("✓ 成功通过多轮对话场景验证 [%s] -> %s (置信度: %.2f)",
					tt.query, result.Type, result.Confidence)
			}
		})
	}
}

// TestIsRelatedToHistory 测试多轮对话关联度识别核心算法
func TestIsRelatedToHistory(t *testing.T) {
	historyName := []ConversationMessage{
		{
			Role:    "user",
			Content: "你的中文名是啥",
		},
		{
			Role:    "assistant",
			Content: "我的中文名是奈娅，也可以叫我全知笔记智能体哦。",
		},
		{
			Role:    "user",
			Content: "为什么不是诺艾呢",
		},
	}

	historyGo := []ConversationMessage{
		{
			Role:    "user",
			Content: "我想学习 Go 语言",
		},
		{
			Role:    "assistant",
			Content: "学习 Go 语言是个不错的选择，我们可以从基础语法开始聊起。",
		},
	}

	tests := []struct {
		name     string
		query    string
		history  []ConversationMessage
		expected bool
	}{
		{
			name:     "无历史记录时默认有关联",
			query:    "查询提示词",
			history:  []ConversationMessage{},
			expected: true,
		},
		{
			name:     "含有强指代词时有关联",
			query:    "那刚才那个是怎么回事情呢？",
			history:  historyName,
			expected: true,
		},
		{
			name:     "短字符提问/澄清有关联",
			query:    "确认",
			history:  historyName,
			expected: true,
		},
		{
			name:     "同一个核心实体/主题词(Go语言)有关联",
			query:    "Go 语言的 channel 应该如何使用呢",
			history:  historyGo,
			expected: true,
		},
		{
			name:     "完全不关联的新提问(中文名 vs 提示词)无关联",
			query:    "查询提示词",
			history:  historyName,
			expected: false,
		},
		{
			name:     "完全不关联的复杂生成问题(Go学习 vs Docker部署)无关联",
			query:    "如何使用 Docker 部署一个 nginx 服务",
			history:  historyGo,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsRelatedToHistory(tt.query, tt.history)
			if got != tt.expected {
				t.Errorf("IsRelatedToHistory() [%s] 失败: query=%s, expected=%v, got=%v",
					tt.name, tt.query, tt.expected, got)
			} else {
				t.Logf("✓ 成功通过关联验证: [%s] -> %v", tt.name, got)
			}
		})
	}
}
