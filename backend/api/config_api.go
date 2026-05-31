package api

import (
	"encoding/json"
	"net/http"
	"os"
	"sync"

	"note_all_backend/global"

	"github.com/gin-gonic/gin"
)

type ConfigApi struct{}

// 敏感字段列表（永不暴露到前端）
var sensitiveFields = []string{
	"sys_password",
	"jwt_secret",
	"mcp_token",
}

// configSaveMutex 配置保存互斥锁，防止并发写入冲突
var configSaveMutex sync.Mutex

// GetConfig 返回非敏感配置
func (c *ConfigApi) GetConfig(ctx *gin.Context) {
	// 复制配置到 map
	configMap := map[string]interface{}{}
	configBytes, err := json.Marshal(global.Config)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "配置序列化失败"})
		return
	}

	if err := json.Unmarshal(configBytes, &configMap); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "配置解析失败"})
		return
	}

	// 移除敏感字段
	for _, field := range sensitiveFields {
		delete(configMap, field)
	}

	ctx.JSON(http.StatusOK, gin.H{"data": configMap})
}

// UpdateConfig 更新配置文件（热加载）
func (c *ConfigApi) UpdateConfig(ctx *gin.Context) {
	var body map[string]interface{}
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "参数解析失败"})
		return
	}

	configSaveMutex.Lock()
	defer configSaveMutex.Unlock()

	// 读取现有配置文件
	configBytes, err := os.ReadFile("config.json")
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "读取配置文件失败: " + err.Error()})
		return
	}

	var existingConfig map[string]interface{}
	if err := json.Unmarshal(configBytes, &existingConfig); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "解析现有配置失败: " + err.Error()})
		return
	}

	// 合并更新（保留敏感字段不变）
	for key, value := range body {
		// 禁止修改敏感字段
		if containsSensitive(sensitiveFields, key) {
			continue
		}
		existingConfig[key] = value
	}

	// 写入文件（保留原有格式）
	newBytes, err := json.MarshalIndent(existingConfig, "", "  ")
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "配置序列化失败: " + err.Error()})
		return
	}

	if err := os.WriteFile("config.json", newBytes, 0644); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "保存配置文件失败: " + err.Error()})
		return
	}

	// 热加载到 global.Config
	if err := json.Unmarshal(newBytes, &global.Config); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "热加载配置失败: " + err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "配置已更新并生效",
		"data":    existingConfig,
	})
}

// containsSensitive 检查字段是否为敏感字段
func containsSensitive(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}