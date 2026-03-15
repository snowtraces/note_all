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
}
