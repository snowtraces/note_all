package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"note_all_backend/global"

	"github.com/gin-gonic/gin"
)

type ConfigApi struct{}

// 敏感字段列表（永不暴露到前端，任何时候都剔除）
var sensitiveFields = []string{
	"sys_password",
	"jwt_secret",
	"mcp_token",
}

// 凭证/Token字段列表（GetConfig时脱敏为"******"，仅在UpdateConfig不为"******"时覆盖写入）
var tokenFields = []string{
	"llm_api_token",
	"vlm_api_token",
	"paddle_token",
	"image_api_token",
}

// configSaveMutex 配置保存互斥锁，防止并发写入冲突
var configSaveMutex sync.Mutex

// GetConfig 返回非敏感配置，且对 API Token 字段进行脱敏
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

	// 对 Token/Key 字段进行脱敏处理，防止泄露
	for _, field := range tokenFields {
		if val, exists := configMap[field]; exists {
			if strVal, ok := val.(string); ok && strVal != "" {
				configMap[field] = "******"
			}
		}
	}

	ctx.JSON(http.StatusOK, gin.H{"data": configMap})
}

// UpdateConfig 更新配置文件（支持 Token 条件覆盖与旧文件自动时间戳备份）
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

	// 合并更新
	for key, value := range body {
		// 禁止修改核心敏感字段
		if containsSensitive(sensitiveFields, key) {
			continue
		}

		// 新增脱敏保护：如果前端传过来的 Token 值为 "******"，代表用户未做修改，保持后端原本的真实明文值不变
		if isTokenField(key) && value == "******" {
			continue
		}

		existingConfig[key] = value
	}

	// 写入文件前，先生成一个时间戳备份文件（备份当前正在运行的 config.json）
	currentTimeStr := time.Now().Format("20060102_150405")
	backupFileName := fmt.Sprintf("config.%s.json", currentTimeStr)
	if err := os.WriteFile(backupFileName, configBytes, 0644); err != nil {
		// 仅记录备份错误，不阻塞核心配置保存流程
		fmt.Fprintf(os.Stderr, "[ConfigApi] 备份旧配置失败: %v\n", err)
	}

	// 写入新配置到 config.json（保留原有格式）
	newBytes, err := json.MarshalIndent(existingConfig, "", "  ")
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "新配置序列化失败: " + err.Error()})
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
		"message": "配置已更新并生效，且旧配置已备份至 " + backupFileName,
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

// isTokenField 检查字段是否为需要脱敏的 Token 字段
func isTokenField(item string) bool {
	for _, s := range tokenFields {
		if s == item {
			return true
		}
	}
	return false
}