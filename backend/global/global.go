package global

import (
	"note_all_backend/storage"

	"gorm.io/gorm"
)

var (
	DB      *gorm.DB
	Storage *storage.SnowStorage

	// Config 全局配置对象
	Config AppConfig

	// WorkerChan 后台任务通道，用于实现阻塞排队逻辑，避免并发过高触发 429
	WorkerChan chan func()

	// VectorExtLoaded 标记 sqlite-vector 扩展是否加载成功
	VectorExtLoaded bool

	// SSEBus SSE 实时推送事件总线
	SSEBus *EventBus
)

type AppConfig struct {
	LlmApiUrl    string `json:"llm_api_url"`
	LlmApiToken  string `json:"llm_api_token"`
	LlmModelID   string `json:"llm_model_id"`
	VlmModelID       string `json:"vlm_model_id"` // 视觉大模型 ID
	EmbeddingModelID string `json:"embedding_model_id"`
	EmbeddingApiUrl  string `json:"embedding_api_url"`
	PaddleApiUrl     string `json:"paddle_api_url"`
	PaddleToken      string `json:"paddle_token"`
	SysPassword      string `json:"sys_password"` // 访问系统所需密码
	JwtSecret        string `json:"jwt_secret"`   // JWT 加密密钥
	ImageApiUrl      string `json:"image_api_url"`
	ImageApiToken    string `json:"image_api_token"`
	McpToken         string `json:"mcp_token"`         // MCP 服务的访问 Token

	// 分片配置
	ChunkMaxSize    int `json:"chunk_max_size"`    // 单片最大字符数，默认 500
	ChunkMinSize    int `json:"chunk_min_size"`    // 单片最小字符数，默认 100
	ChunkOverlap    int `json:"chunk_overlap"`     // 重叠字符数，默认 50
	ChunkMaxPerDoc  int `json:"chunk_max_per_doc"` // 单文档最大分片数，默认 100
	RagContextLimit int `json:"rag_context_limit"` // RAG 上下文长度限制，默认 12000

	// 模型窗口配置（上下文治理）
	LlmContextWindow  int `json:"llm_context_window"`   // 模型上下文窗口大小，默认 32000
	LlmMaxOutputTokens int `json:"llm_max_output_tokens"` // 输出最大 token 数，默认 8192
	LlmReservedTokens  int `json:"llm_reserved_tokens"`  // 为输出预留的 token，默认 8000
	LlmBufferTokens    int `json:"llm_buffer_tokens"`    // 恢复预留 buffer，默认 4000
}
