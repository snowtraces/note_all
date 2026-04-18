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

	// 分片配置
	ChunkMaxSize    int `json:"chunk_max_size"`    // 单片最大字符数，默认 500
	ChunkMinSize    int `json:"chunk_min_size"`    // 单片最小字符数，默认 100
	ChunkOverlap    int `json:"chunk_overlap"`     // 重叠字符数，默认 50
	ChunkMaxPerDoc  int `json:"chunk_max_per_doc"` // 单文档最大分片数，默认 100
	RagContextLimit int `json:"rag_context_limit"` // RAG 上下文长度限制，默认 12000
}
