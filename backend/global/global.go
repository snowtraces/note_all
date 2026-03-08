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
	PaddleApiUrl string `json:"paddle_api_url"`
	PaddleToken  string `json:"paddle_token"`
}
