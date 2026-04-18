# 多轮对话 Agent 设计文档

## 1. 问题分析

### 1.1 当前系统状态

**现有架构：**
- `RAGAsk(query)` 是单轮问答，无对话历史
- `Ask` API 接收 `messages[]` 但只提取最后一条用户消息
- `ChatSession` / `ChatMessage` 已存在，仅用于**事后存储**，不参与推理
- 检索阶段 (`HybridSearch`) 完全独立于对话上下文

**核心缺陷：**
1. **无上下文记忆**：用户问 "它有什么特点？" 无法关联上一轮讨论的对象
2. **无意图追踪**：无法理解追问、澄清、切换话题等对话行为
3. **无查询重写**：无法将模糊指代转化为完整检索词
4. **无工具调用**：不支持多步骤任务（如"先找A，再总结B"）

---

## 2. 设计目标

| 目标 | 说明 |
|------|------|
| 上下文理解 | 解析"它"、"上面提到的"、"那个文档"等指代 |
| 意图延续 | 区分追问、澄清、反驳、切换话题 |
| 多步任务 | 支持链式工具调用（检索→分析→生成） |
| 历史压缩 | 长对话自动压缩，避免 token 爆炸 |
| 引用溯源 | 回答时标注来源文档 ID |

---

## 3. Agent 架构设计

### 3.1 整体架构

```
用户输入
    │
    ▼
┌─────────────────┐
│  Session Loader │ ← 加载历史对话
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Intent Analyzer │ ← 分析当前轮意图类型
└─────────────────┘
    │
    ├─ [追问/指代] ─→ Query Rewriter (结合历史重写)
    │
    ├─ [新话题] ──→ Intent Detection + HybridSearch
    │
    ├─ [多步任务] ─→ Task Planner (拆解子任务)
    │
    ▼
┌─────────────────┐
│  Tool Executor  │ ← 执行检索/分析/生成工具
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Response Builder│ ← 构建回答 + 引用标注
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Session Saver   │ ← 持久化本轮对话
└─────────────────┘
```

### 3.2 核心模块

#### 3.2.1 Session Manager

**职责：** 管理对话会话生命周期

```go
type SessionManager struct {
    db *gorm.DB
}

type ConversationSession struct {
    ID          uint
    Title       string
    Messages    []ConversationMessage
    Context     *SessionContext  // 当前关注的文档/话题
    CreatedAt   time.Time
}

type SessionContext struct {
    ActiveDocuments []uint      // 当前讨论的文档 ID
    ActiveTopic     string      // 当前话题关键词
    LastIntent      string      // 上轮意图
}

type ConversationMessage struct {
    Role        string           // user / assistant / system
    Content     string
    References  []uint           // 引用的文档 ID
    Timestamp   time.Time
}
```

**接口设计：**

```go
// LoadSession 加载历史会话（带压缩）
func (sm *SessionManager) LoadSession(sessionID uint, maxTurns int) (*ConversationSession, error)

// SaveTurn 保存单轮对话
func (sm *SessionManager) SaveTurn(sessionID uint, msg ConversationMessage) error

// CompressHistory 压缩长对话历史
func (sm *SessionManager) CompressHistory(sessionID uint, keepTurns int) error
```

#### 3.2.2 Intent Analyzer

**职责：** 分析用户输入的意图类型

```go
type IntentType string

const (
    IntentNewTopic    IntentType = "new_topic"     // 新话题
    IntentFollowUp    IntentType = "follow_up"     // 追问（需上下文）
    IntentClarify     IntentType = "clarify"       // 澄清请求
    IntentSwitch      IntentType = "switch"        // 切换话题
    IntentMultiStep   IntentType = "multi_step"    // 多步任务
    IntentRecord      IntentType = "record"        // 记录/备忘
)

type IntentAnalyzer struct{}

type IntentResult struct {
    Type         IntentType
    Reference    string           // 指代对象（如"它"、"上面那个"）
    SubTasks     []string         // 多步任务拆解
    Confidence   float32
}

func (ia *IntentAnalyzer) Analyze(query string, history []ConversationMessage, context *SessionContext) IntentResult
```

**意图识别规则：**

| 意图类型 | 触发条件 | 处理策略 |
|----------|----------|----------|
| `follow_up` | 包含"它"、"那个"、"上面"、"刚才"等指代词 | Query Rewriter 结合 Context 重写 |
| `clarify` | 包含"什么意思"、"具体"、"能解释" | 直接复用上轮引用文档 |
| `switch` | 包含"换个话题"、"说另外" | 清空 Context，新话题检索 |
| `multi_step` | 包含"先...再..."、"然后" | Task Planner 拆解 |
| `new_topic` | 无指代，无明显追问词 | Intent Detection + HybridSearch |

#### 3.2.3 Query Rewriter

**职责：** 将模糊指代查询重写为完整检索词

```go
type QueryRewriter struct{}

type RewriteResult struct {
    OriginalQuery   string
    RewrittenQuery  string
    ExpandedTerms   []string       // 扩展检索词
    FocusDocuments  []uint         // 锁定文档范围
}

func (qr *QueryRewriter) Rewrite(query string, history []ConversationMessage, context *SessionContext) RewriteResult
```

**重写示例：**

| 原查询 | 上下文 | 重写结果 |
|--------|--------|----------|
| "它的特点是什么？" | 上轮讨论 ID=5《设计模式》 | "设计模式的特点是什么？" + FocusDocuments=[5] |
| "上面提到的那个文件" | 上轮引用 ID=12,15 | FocusDocuments=[12,15]，无需检索 |
| "总结一下" | 上轮检索到 3 篇文档 | summarize intent + FocusDocuments=[上轮引用] |

#### 3.2.4 Tool Executor

**职责：** 执行具体任务（检索、分析、生成）

```go
type Tool string

const (
    ToolSearch      Tool = "search"       // 检索文档
    ToolSummarize   Tool = "summarize"    // 总结文档
    ToolAnalyze     Tool = "analyze"      // 分析关系
    ToolGenerate    Tool = "generate"     // 生成内容
    ToolCompare     Tool = "compare"      // 对比分析
)

type ToolExecutor struct {
    ragService *RAGService
}

type ToolCall struct {
    Tool         Tool
    Parameters   map[string]interface{}
}

type ToolResult struct {
    Output       string
    Documents    []SearchResult
    Metadata     map[string]interface{}
}

func (te *ToolExecutor) Execute(call ToolCall) ToolResult
```

#### 3.2.5 Response Builder

**职责：** 构建最终回复，包含引用标注

```go
type ResponseBuilder struct{}

type AgentResponse struct {
    Content      string
    References   []ReferenceItem
    Intent       IntentType
    ToolCalls    []ToolCall        // 透明化工具调用过程
}

type ReferenceItem struct {
    DocumentID   uint
    Title        string
    Snippet      string            // 相关片段
    Relevance    float32           // 相关度评分
}

func (rb *ResponseBuilder) Build(toolResults []ToolResult, intent IntentType) AgentResponse
```

---

## 4. Agent 工作流

### 4.1 主流程

```go
func AgentAsk(sessionID uint, query string) (*AgentResponse, error) {
    // 1. 加载会话历史
    session := sessionManager.LoadSession(sessionID, maxTurns=10)

    // 2. 分析意图
    intent := intentAnalyzer.Analyze(query, session.Messages, session.Context)

    // 3. 根据意图分支处理
    var toolResults []ToolResult

    switch intent.Type {
    case IntentFollowUp, IntentClarify:
        // 重写查询，锁定文档范围
        rewrite := queryRewriter.Rewrite(query, session.Messages, session.Context)
        if len(rewrite.FocusDocuments) > 0 {
            // 直接使用已有文档，无需检索
            docs := loadDocuments(rewrite.FocusDocuments)
            toolResults = append(toolResults, executeLLM(query, docs))
        } else {
            // 重写后重新检索
            toolResults = append(toolResults, executeSearch(rewrite.RewrittenQuery))
        }

    case IntentNewTopic:
        // 原有 RAG 流程
        toolResults = append(toolResults, executeSearch(query))
        session.Context.ActiveDocuments = extractDocIDs(toolResults)

    case IntentMultiStep:
        // 拆解任务，顺序执行
        for _, task := range intent.SubTasks {
            toolResults = append(toolResults, executeTask(task))
        }

    case IntentSwitch:
        // 清空上下文，新话题
        session.Context = &SessionContext{}
        toolResults = append(toolResults, executeSearch(query))
    }

    // 4. 构建回复
    response := responseBuilder.Build(toolResults, intent.Type)

    // 5. 更新上下文并保存
    updateContext(session.Context, toolResults, intent)
    sessionManager.SaveTurn(sessionID, ConversationMessage{
        Role:       "user",
        Content:    query,
        Timestamp:  time.Now(),
    })
    sessionManager.SaveTurn(sessionID, ConversationMessage{
        Role:       "assistant",
        Content:    response.Content,
        References: extractIDs(response.References),
        Timestamp:  time.Now(),
    })

    return response, nil
}
```

### 4.2 多步任务示例

用户输入：**"先找出关于Go语言的文章，然后总结它们的特点"**

```
IntentAnalyzer → IntentMultiStep
    │
    ├── SubTask[0]: "找出关于Go语言的文章"
    │       └── ToolCall: search(query="Go语言")
    │           └── Result: 5 documents [ID: 1,3,7,9,12]
    │
    └── SubTask[1]: "总结它们的特点"
            └── ToolCall: summarize(documents=[1,3,7,9,12])
                └── Result: "Go语言特点包括..."

ResponseBuilder → 最终回复（带引用标注）
```

---

## 5. 对话历史压缩策略

### 5.1 问题

长对话会导致：
1. Token 数爆炸，超出 LLM 限制
2. 无关历史干扰当前推理
3. 存储/加载性能下降

### 5.2 压缩方案

**策略：滑动窗口 + 语义摘要**

```go
func (sm *SessionManager) CompressIfNeeded(session *ConversationSession, maxTokens int) {
    // 1. 计算当前历史 token 数
    currentTokens := estimateTokens(session.Messages)

    if currentTokens > maxTokens {
        // 2. 保留最近 N 轮 + 压缩早期对话
        keepTurns := 4
        recent := session.Messages[len(session.Messages)-keepTurns:]

        // 3. 早期对话生成摘要
        early := session.Messages[:len(session.Messages)-keepTurns]
        summary := generateSummary(early)

        // 4. 替换历史
        session.Messages = []ConversationMessage{
            {Role: "system", Content: "历史对话摘要：" + summary},
        }
        session.Messages = append(session.Messages, recent...)
    }
}
```

**摘要 Prompt：**

```
请将以下对话历史压缩为一段简短摘要（保留关键讨论点和引用的文档）：

[对话历史...]

输出格式：
讨论了X、Y、Z话题，主要涉及文档：[ID列表]，关键结论：...
```

---

## 6. API 变更设计

### 6.1 新增端点

```go
// POST /api/agent/ask
type AgentAskRequest struct {
    SessionID  uint   `json:"session_id"`     // 可选，0 表示新建
    Query      string `json:"query" binding:"required"`
}

type AgentAskResponse struct {
    Content      string          `json:"content"`
    SessionID    uint            `json:"session_id"`
    References   []ReferenceItem `json:"references"`
    Intent       string          `json:"intent"`
    ToolCalls    []ToolCallInfo  `json:"tool_calls,omitempty"`  // 可选：透明化过程
}
```

### 6.2 兼容现有 API

保持 `/api/ask` 端点不变，内部可降级为单轮 RAG。

---

## 7. 数据模型扩展

### 7.1 新增字段

```go
// ChatSession 扩展
type ChatSession struct {
    // ... existing fields
    ContextSummary string `gorm:"type:text" json:"context_summary"`  // 历史压缩摘要
    ActiveDocs     string `gorm:"size:255" json:"active_docs"`       // 当前关注文档 JSON
}

// ChatMessage 扩展
type ChatMessage struct {
    // ... existing fields
    Intent         string `gorm:"size:32" json:"intent"`             // 该轮意图类型
    ToolCalls      string `gorm:"type:text" json:"tool_calls"`       // 工具调用 JSON
}
```

---

## 8. 实现计划

### Phase 1：基础设施（预估 2 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| SessionManager | `service/session.go` | 加载/保存/压缩历史 |
| 模型扩展 | `models/note.go` | 新增字段 |
| 数据迁移 | 数据库 | 回填字段 |

### Phase 2：意图分析（预估 1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| IntentAnalyzer | `service/intent.go` | 意图分类逻辑 |
| QueryRewriter | `service/rewrite.go` | 指代重写逻辑 |

### Phase 3：Agent 工作流（预估 2 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| AgentAsk | `service/agent.go` | 主流程整合 |
| ToolExecutor | `service/tools.go` | 工具调用封装 |
| ResponseBuilder | `service/response.go` | 回复构建 |

### Phase 4：API & 测试（预估 1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| 新端点 | `api/agent.go` | `/api/agent/ask` |
| 单元测试 | `service/*_test.go` | 各模块测试 |
| 集成测试 | 全流程验证 | |

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 意图识别错误 | 错误分支处理 | 低置信度时降级为单轮 RAG |
| 历史压缩丢失关键信息 | 上下文断裂 | 压缩时保留文档 ID 列表 |
| 多步任务执行失败 | 任务中断 | 支持断点续传 |
| Token 超限 | API 报错 | 级联压缩策略 |

---

## 11. 详细实现规格

### 11.1 设计决策汇总

| 决策点 | 选择 | 说明 |
|--------|------|------|
| 意图识别 | 规则匹配 | 关键词 + 前缀检测，低置信度降级为 `new_topic` |
| 历史压缩 | 4轮 + 摘要 | 滑动窗口保留最近 4 轮，早期生成 LLM 摘要 |
| 多步任务 | 静态拆解 | 3 种预设模板，顺序执行 |
| 透明度 | 返回所有过程 | `tool_calls` 字段完整返回 |
| 指代词库 | 预设 15 个词 | 覆盖常见场景，无需动态扩展 |
| ActiveDocuments | 自动追踪 | 每轮引用文档自动成为关注对象 |
| 引用粒度 | 文档级 | 前端展示文档卡片，不追踪分片 |

---

### 11.2 指代词库定义

```go
// 15 个预设指代词，用于检测 follow_up / clarify 意图
var referenceWords = []string{
    "它", "它们", "这个", "那个", "这些", "那些",
    "上面", "刚才", "之前", "之前提到的",
    "这篇文章", "那个文件", "上面的内容",
    "那个文档", "上面的文档",
}

// 指代词检测函数
func containsReference(query string) bool {
    for _, word := range referenceWords {
        if strings.Contains(query, word) {
            return true
        }
    }
    return false
}
```

---

### 11.3 意图识别规则表

```go
// IntentAnalyzer 核心规则匹配逻辑
func (ia *IntentAnalyzer) Analyze(query string, history []ConversationMessage, context *SessionContext) IntentResult {
    query = strings.ToLower(strings.TrimSpace(query))

    // 优先级 1: 多步任务（包含拆解关键词）
    if strings.Contains(query, "先") && strings.Contains(query, "再") {
        return IntentResult{
            Type:       IntentMultiStep,
            SubTasks:   parseMultiStep(query),
            Confidence: 0.9,
        }
    }
    if strings.Contains(query, "然后") || strings.Contains(query, "接着") {
        return IntentResult{
            Type:       IntentMultiStep,
            SubTasks:   parseMultiStep(query),
            Confidence: 0.85,
        }
    }

    // 优先级 2: 话题切换
    switchMarkers := []string{"换个话题", "说另外", "换个话题", "不聊这个", "换个方向"}
    for _, marker := range switchMarkers {
        if strings.Contains(query, marker) {
            return IntentResult{
                Type:       IntentSwitch,
                Confidence: 0.95,
            }
        }
    }

    // 优先级 3: 指代追问（有上下文时）
    if len(history) > 0 && len(context.ActiveDocuments) > 0 {
        if containsReference(query) {
            return IntentResult{
                Type:       IntentFollowUp,
                Reference:  extractReference(query),
                Confidence: 0.8,
            }
        }

        // 优先级 4: 澄清请求
        clarifyMarkers := []string{"什么意思", "具体", "能解释", "详细说", "展开"}
        for _, marker := range clarifyMarkers {
            if strings.Contains(query, marker) {
                return IntentResult{
                    Type:       IntentClarify,
                    Confidence: 0.75,
                }
            }
        }
    }

    // 默认: 新话题
    return IntentResult{
        Type:       IntentNewTopic,
        Confidence: 0.5,
    }
}
```

---

### 11.4 查询重写策略

```go
// QueryRewriter 重写逻辑
func (qr *QueryRewriter) Rewrite(query string, history []ConversationMessage, context *SessionContext) RewriteResult {
    result := RewriteResult{
        OriginalQuery:  query,
        RewrittenQuery: query,
        FocusDocuments: context.ActiveDocuments,
    }

    // 如果有指代词，结合上下文重写
    if containsReference(query) && len(context.ActiveDocuments) > 0 {
        // 获取上轮讨论的文档标题/话题
        topic := context.ActiveTopic
        if topic == "" && len(context.ActiveDocuments) > 0 {
            // 从文档中提取话题
            topic = getDocumentTitle(context.ActiveDocuments[0])
        }

        // 替换指代词为具体话题
        for _, ref := range referenceWords {
            if strings.Contains(query, ref) {
                result.RewrittenQuery = strings.Replace(query, ref, topic, 1)
                break
            }
        }
    }

    return result
}

// 示例输出：
// 输入: "它的特点是什么？"
// 上下文: ActiveDocuments=[5], ActiveTopic="设计模式"
// 输出: RewrittenQuery="设计模式的特点是什么？", FocusDocuments=[5]
```

---

### 11.5 多步任务模板

**3 种预设模板：**

```go
// MultiStepTemplate 多步任务模板定义
type MultiStepTemplate struct {
    Name      string
    Pattern   string           // 匹配正则
    Steps     []StepDefinition // 执行步骤
}

type StepDefinition struct {
    Tool       Tool
    InputFrom  string           // "query" 或 "prev_result" 或 "prev_documents"
}

var multiStepTemplates = []MultiStepTemplate{
    // 模板 1: 检索 → 总结
    {
        Name:    "search_then_summarize",
        Pattern: "先.*找.*再.*总结",
        Steps: []StepDefinition{
            {Tool: ToolSearch, InputFrom: "query"},
            {Tool: ToolSummarize, InputFrom: "prev_documents"},
        },
    },

    // 模板 2: 检索 → 对比
    {
        Name:    "search_then_compare",
        Pattern: "先.*找.*再.*对比",
        Steps: []StepDefinition{
            {Tool: ToolSearch, InputFrom: "query"},
            {Tool: ToolCompare, InputFrom: "prev_documents"},
        },
    },

    // 模板 3: 多检索 → 聚合
    {
        Name:    "multi_search_then_synthesize",
        Pattern: "分别找.*和.*然后.*聚合",
        Steps: []StepDefinition{
            {Tool: ToolSearch, InputFrom: "query_part1"},  // 第一个检索词
            {Tool: ToolSearch, InputFrom: "query_part2"},  // 第二个检索词
            {Tool: ToolGenerate, InputFrom: "prev_documents"},
        },
    },
}

// 任务拆解函数
func parseMultiStep(query string) []SubTask {
    for _, template := range multiStepTemplates {
        if matched, _ := regexp.MatchString(template.Pattern, query); matched {
            return buildSubTasks(query, template)
        }
    }

    // 默认拆解：按 "先...再..." 分割
    parts := splitByMarkers(query, []string{"先", "再", "然后"})
    tasks := make([]SubTask, len(parts))
    for i, part := range parts {
        tasks[i] = SubTask{
            Query:  cleanQuery(part),
            Intent: detectSubIntent(part),
        }
    }
    return tasks
}
```

---

### 11.6 历史压缩详细规格

```go
// 压缩参数
const (
    MaxKeepTurns    = 4              // 保留最近 4 轮对话
    MaxTokens       = 4000           // 触发压缩的 token 阈值
    SummaryMaxChars = 500            // 摘要最大字数
)

// 压缩流程
func (sm *SessionManager) CompressIfNeeded(session *ConversationSession) {
    // 1. 估算 token 数（简单估算：4 字符 ≈ 1 token）
    estimatedTokens := len(session.Messages) * 100  // 每轮约 100 token

    if estimatedTokens <= MaxTokens {
        return  // 无需压缩
    }

    // 2. 分割历史
    total := len(session.Messages)
    if total <= MaxKeepTurns {
        return
    }

    recentStart := total - MaxKeepTurns
    earlyMessages := session.Messages[:recentStart]
    recentMessages := session.Messages[recentStart:]

    // 3. 生成早期对话摘要
    summary := sm.generateSummary(earlyMessages)

    // 4. 构建压缩后的历史
    compressed := []ConversationMessage{
        {
            Role:    "system",
            Content: "【历史对话摘要】" + summary,
        },
    }
    compressed = append(compressed, recentMessages...)

    session.Messages = compressed

    // 5. 更新 DB（持久化摘要）
    sm.db.Model(&ChatSession{}).
        Where("id = ?", session.ID).
        Update("context_summary", summary)
}

// 摘要生成 Prompt
func (sm *SessionManager) generateSummary(messages []ConversationMessage) string {
    // 构建 Prompt
    prompt := "请将以下对话历史压缩为一段简短摘要（保留关键讨论话题和涉及的文档ID）：\n\n"
    for _, msg := range messages {
        prompt += fmt.Sprintf("[%s]: %s\n", msg.Role, msg.Content)
        if len(msg.References) > 0 {
            prompt += fmt.Sprintf("  引用文档: %v\n", msg.References)
        }
    }

    prompt += "\n输出格式（不超过500字）：讨论了X、Y话题，主要涉及文档[ID列表]，关键结论：..."

    // 调用 LLM
    summary, _ := pkg.AskAI([]map[string]string{
        {"role": "user", "content": prompt},
    }, "你是一个对话摘要助手。")

    if len(summary) > SummaryMaxChars {
        summary = summary[:SummaryMaxChars] + "..."
    }

    return summary
}
```

---

### 11.7 ActiveDocuments 自动追踪

```go
// updateContext 更新会话上下文
func updateContext(context *SessionContext, toolResults []ToolResult, intent IntentType) {
    switch intent {
    case IntentNewTopic, IntentSearch:
        // 新话题：替换 ActiveDocuments
        newDocs := extractDocumentIDs(toolResults)
        if len(newDocs) > 0 {
            context.ActiveDocuments = newDocs
            context.ActiveTopic = extractTopic(toolResults[0].Output)
        }

    case IntentFollowUp, IntentClarify:
        // 追问/澄清：追加引用文档（不替换）
        newDocs := extractDocumentIDs(toolResults)
        for _, docID := range newDocs {
            if !contains(context.ActiveDocuments, docID) {
                context.ActiveDocuments = append(context.ActiveDocuments, docID)
            }
        }
        // 限制最多 10 个关注文档
        if len(context.ActiveDocuments) > 10 {
            context.ActiveDocuments = context.ActiveDocuments[:10]
        }

    case IntentSwitch:
        // 切换话题：清空
        context.ActiveDocuments = nil
        context.ActiveTopic = ""
    }

    // 更新 LastIntent
    context.LastIntent = string(intent)
}

// 提取文档 ID
func extractDocumentIDs(results []ToolResult) []uint {
    ids := make([]uint, 0)
    for _, result := range results {
        for _, doc := range result.Documents {
            ids = append(ids, doc.ID)
        }
    }
    return uniqueIDs(ids)
}
```

---

### 11.8 文档级引用数据结构

```go
// ReferenceItem 文档级引用（前端展示卡片）
type ReferenceItem struct {
    DocumentID   uint    `json:"document_id"`
    Title        string  `json:"title"`          // original_name
    Summary      string  `json:"summary"`        // ai_summary（前 100 字）
    Relevance    float32 `json:"relevance"`      // 相关度评分
}

// 从 SearchResult 转换
func buildReferences(docs []SearchResult) []ReferenceItem {
    refs := make([]ReferenceItem, 0, len(docs))
    for _, doc := range docs {
        summary := doc.AiSummary
        if len(summary) > 100 {
            summary = summary[:100] + "..."
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
```

---

### 11.9 ToolCalls 透明化数据结构

```go
// ToolCallInfo 返回给前端的工具调用信息
type ToolCallInfo struct {
    Step        int                    `json:"step"`           // 步骤序号
    Tool        string                 `json:"tool"`           // 工具名称
    Input       map[string]interface{} `json:"input"`          // 输入参数
    Output      string                 `json:"output"`         // 输出摘要（前 200 字）
    Documents   []uint                 `json:"documents"`      // 涉及文档 ID
    Duration    int64                  `json:"duration"`       // 执行耗时(ms)
    Timestamp   string                 `json:"timestamp"`      // 执行时间
}

// AgentAskResponse 完整响应结构
type AgentAskResponse struct {
    Content      string          `json:"content"`        // 最终回复
    SessionID    uint            `json:"session_id"`     // 会话 ID
    References   []ReferenceItem `json:"references"`     // 引用文档
    Intent       string          `json:"intent"`         // 意图类型
    Confidence   float32         `json:"confidence"`     // 意图置信度
    ToolCalls    []ToolCallInfo  `json:"tool_calls"`     // 工具调用过程
}

// 构建示例
func buildToolCallInfo(step int, call ToolCall, result ToolResult, duration int64) ToolCallInfo {
    output := result.Output
    if len(output) > 200 {
        output = output[:200] + "..."
    }

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
```

---

### 11.10 完整 API 响应示例

```json
{
  "content": "Go语言的主要特点包括：\n1. 静态类型，编译速度快\n2. 内置并发支持（goroutine）\n3. 简洁的语法设计...",
  "session_id": 42,
  "references": [
    {
      "document_id": 5,
      "title": "Go语言设计模式笔记",
      "summary": "记录了Go语言常用的设计模式实践...",
      "relevance": 0.92
    },
    {
      "document_id": 12,
      "title": "并发编程最佳实践",
      "summary": "goroutine和channel的使用指南...",
      "relevance": 0.85
    }
  ],
  "intent": "multi_step",
  "confidence": 0.9,
  "tool_calls": [
    {
      "step": 1,
      "tool": "search",
      "input": {"query": "Go语言"},
      "output": "检索到 5 篇相关文档...",
      "documents": [5, 12, 7, 9, 3],
      "duration": 850,
      "timestamp": "2024-01-15 10:30:22"
    },
    {
      "step": 2,
      "tool": "summarize",
      "input": {"documents": [5, 12, 7, 9, 3]},
      "output": "总结完成，主要特点包括...",
      "documents": [5, 12],
      "duration": 1200,
      "timestamp": "2024-01-15 10:30:25"
    }
  ]
}
```

---

## 12. 前端展示建议

### 12.1 ToolCalls 展示

```
┌─────────────────────────────────────┐
│ 🔍 Step 1: search                    │
│ 输入: "Go语言"                        │
│ 结果: 检索到 5 篇文档                  │
│ 耗时: 850ms                          │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 📝 Step 2: summarize                 │
│ 输入: 文档 [5, 12, 7, 9, 3]           │
│ 结果: 生成总结                        │
│ 耗时: 1200ms                         │
└─────────────────────────────────────┘
```

### 12.2 References 展示（文档卡片）

```
┌──────────────────┐  ┌──────────────────┐
│ 📄 Go语言设计模式 │  │ 📄 并发编程实践   │
│ 相关度: 92%      │  │ 相关度: 85%      │
│ 记录了Go语言...  │  │ goroutine和...   │
│ [查看原文]       │  │ [查看原文]       │
└──────────────────┘  └──────────────────┘
```

---

## 13. 后续演进

- **流式输出**：支持 SSE 推送中间结果
- **记忆增强**：长期记忆存储用户偏好
- **多模态**：支持图片输入检索
- **Agent 可观测**：可视化工具调用链路