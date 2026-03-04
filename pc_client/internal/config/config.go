package config

import (
	"encoding/json"
	"os"
	"path/filepath"

	"note_all_pc/internal/domain"
)

// 默认配置
var DefaultConfig = domain.Config{
	ServerURL:        "http://localhost:8080",
	UploadTimeoutSec: 30,
}

// LoadConfig 按优先级读取配置文件
func LoadConfig() (*domain.Config, error) {
	exePath, err := os.Executable()
	if err != nil {
		return &DefaultConfig, nil
	}

	cfgPath := filepath.Join(filepath.Dir(exePath), "config.json")
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		// 配置文件不存在，使用默认值
		return &DefaultConfig, nil
	}

	cfg := DefaultConfig // 继承默认值
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SaveConfig 将当前配置写回 exe 同目录的 config.json
func SaveConfig(cfg *domain.Config) error {
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
