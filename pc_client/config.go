package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Config 客户端配置
type Config struct {
	ServerURL        string `json:"server_url"`
	UploadTimeoutSec int    `json:"upload_timeout_sec"`
}

// 默认配置
var defaultConfig = Config{
	ServerURL:        "http://localhost:8080",
	UploadTimeoutSec: 30,
}

// LoadConfig 按优先级读取配置文件：
// 1. exe 同目录下的 config.json（便携模式）
// 2. 返回默认配置
func LoadConfig() (*Config, error) {
	exePath, err := os.Executable()
	if err != nil {
		return &defaultConfig, nil
	}

	cfgPath := filepath.Join(filepath.Dir(exePath), "config.json")
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		// 配置文件不存在，使用默认值
		return &defaultConfig, nil
	}

	cfg := defaultConfig // 继承默认值
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SaveConfig 将当前配置写回 exe 同目录的 config.json
func SaveConfig(cfg *Config) error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	cfgPath := filepath.Join(filepath.Dir(exePath), "config.json")
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(cfgPath, data, 0644)
}
