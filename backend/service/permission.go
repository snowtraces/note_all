package service

import (
	"log"
)

// PermissionResult 权限判定结果
type PermissionResult string

const (
	PermissionAllow PermissionResult = "allow" // 允许执行
	PermissionDeny  PermissionResult = "deny"  // 拒绝执行
	PermissionAsk   PermissionResult = "ask"   // 需要用户确认
)

// RiskLevel 工具风险等级
type RiskLevel string

const (
	RiskLow    RiskLevel = "low"    // 低风险：只读操作
	RiskMedium RiskLevel = "medium" // 中风险：涉及外部关联
	RiskHigh   RiskLevel = "high"   // 高风险：生成内容、修改数据
)

// ToolPermission 工具权限配置
type ToolPermission struct {
	Tool          Tool
	RiskLevel     RiskLevel
	DefaultResult PermissionResult
	Description   string
}

// PermissionManager 权限管理器
type PermissionManager struct {
	permissions map[Tool]ToolPermission
}

// DefaultToolPermissions 默认权限配置
var DefaultToolPermissions = map[Tool]ToolPermission{
	ToolSearch: {
		Tool:          ToolSearch,
		RiskLevel:     RiskLow,
		DefaultResult: PermissionAllow,
		Description:   "检索文档：只读操作，低风险",
	},
	ToolSummarize: {
		Tool:          ToolSummarize,
		RiskLevel:     RiskLow,
		DefaultResult: PermissionAllow,
		Description:   "总结文档：只读操作，低风险",
	},
	ToolCompare: {
		Tool:          ToolCompare,
		RiskLevel:     RiskMedium,
		DefaultResult: PermissionAllow,
		Description:   "对比分析：涉及多文档关联，中风险",
	},
	ToolAnalyze: {
		Tool:          ToolAnalyze,
		RiskLevel:     RiskMedium,
		DefaultResult: PermissionAllow,
		Description:   "关系分析：涉及外部关联，中风险",
	},
	ToolGenerate: {
		Tool:          ToolGenerate,
		RiskLevel:     RiskHigh,
		DefaultResult: PermissionAsk,
		Description:   "生成内容：可能生成不当内容，高风险",
	},
}

// NewPermissionManager 创建权限管理器
func NewPermissionManager() *PermissionManager {
	return &PermissionManager{
		permissions: DefaultToolPermissions,
	}
}

// CheckPermission 检查工具执行权限
func (pm *PermissionManager) CheckPermission(tool Tool, params map[string]interface{}) PermissionResult {
	perm, ok := pm.permissions[tool]
	if !ok {
		// 未知工具，默认需要确认
		log.Printf("[PermissionManager] 未知工具: %s，需要确认", tool)
		return PermissionAsk
	}

	// 根据风险等级和参数内容判断
	result := perm.DefaultResult

	// 特殊情况：生成工具涉及敏感内容时需要确认
	if tool == ToolGenerate {
		prompt, _ := params["prompt"].(string)
		if containsSensitiveKeywords(prompt) {
			log.Printf("[PermissionManager] 生成工具包含敏感关键词，拒绝执行")
			return PermissionDeny
		}
	}

	// 特殊情况：分析工具涉及大量文档时需要确认
	if tool == ToolAnalyze {
		docID, _ := params["doc_id"].(uint)
		if docID == 0 {
			log.Printf("[PermissionManager] 分析工具未指定文档，需要确认")
			return PermissionAsk
		}
	}

	log.Printf("[PermissionManager] 权限判定: tool=%s, risk=%s, result=%s", tool, perm.RiskLevel, result)
	return result
}

// GetPermissionInfo 获取工具权限信息
func (pm *PermissionManager) GetPermissionInfo(tool Tool) ToolPermission {
	perm, ok := pm.permissions[tool]
	if !ok {
		return ToolPermission{
			Tool:          tool,
			RiskLevel:     RiskHigh,
			DefaultResult: PermissionAsk,
			Description:   "未知工具",
		}
	}
	return perm
}

// containsSensitiveKeywords 检查是否包含敏感关键词
func containsSensitiveKeywords(text string) bool {
	if text == "" {
		return false
	}

	sensitiveKeywords := []string{
		"密码", "账号", "银行卡", "身份证",
		"token", "secret", "key", "password",
	}

	for _, kw := range sensitiveKeywords {
		if stringsContains(text, kw) {
			return true
		}
	}
	return false
}

// stringsContains 字符串包含检查（简化版）
func stringsContains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && findSubstring(s, substr))
}

// findSubstring 查找子串
func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// NeedUserConfirm 判断是否需要用户确认
func NeedUserConfirm(tool Tool, params map[string]interface{}) bool {
	pm := NewPermissionManager()
	return pm.CheckPermission(tool, params) == PermissionAsk
}