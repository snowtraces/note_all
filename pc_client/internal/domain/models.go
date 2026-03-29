package domain

// Config 客户端配置
type Config struct {
	ServerURL        string `json:"server_url"`
	AuthToken        string `json:"auth_token"`
	UploadTimeoutSec int    `json:"upload_timeout_sec"`
}

// UploadResult 上传结果
type UploadResult struct {
	NoteID  string
	Message string
}
