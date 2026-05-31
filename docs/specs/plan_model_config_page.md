# Plan: 模型配置管理页面实现

## 概述

本计划将 **Spec** 中的设计转化为具体实现步骤，分为三个阶段：
- **Phase 1**: 后端 API（配置读写 + 动态加载）
- **Phase 2**: 前端页面（ModelConfigTab 组件）
- **Phase 3**: 集成改造（query_loop 动态读取）

---

## 依赖关系图

```
┌─────────────────────────────────────────────────────────────┐
│                     Phase 1: 后端 API                        │
│  config_api.go ──→ router.go ──→ global.Config 热加载       │
└─────────────────────────────────────────────────────────────┘
                          ↓ 依赖
┌─────────────────────────────────────────────────────────────┐
│                     Phase 2: 前端页面                        │
│  configApi.js ──→ ModelConfigTab.jsx ──→ SettingsModal.jsx  │
└─────────────────────────────────────────────────────────────┘
                          ↓ 依赖
┌─────────────────────────────────────────────────────────────┐
│                   Phase 3: 集成改造                          │
│  query_loop.go ──→ 读取 global.Config (非硬编码)            │
│  pkg/llm.go ──→ 使用新参数调用 LLM                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 后端 API

### 1.1 新增 `backend/api/config_api.go`

```go
package api

import (
    "encoding/json"
    "net/http"
    "os"
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

// GetConfig 返回非敏感配置
func (c *ConfigApi) GetConfig(ctx *gin.Context) {
    // 复制配置，移除敏感字段
    configMap := map[string]interface{}{}
    configBytes, _ := json.Marshal(global.Config)
    json.Unmarshal(configBytes, &configMap)
    
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
    
    // 读取现有配置
    configBytes, err := os.ReadFile("config.json")
    if err != nil {
        ctx.JSON(http.StatusInternalServerError, gin.H{"error": "读取配置失败"})
        return
    }
    
    var existingConfig map[string]interface{}
    json.Unmarshal(configBytes, &existingConfig)
    
    // 合并更新（保留敏感字段不变）
    for key, value := range body {
        if !contains(sensitiveFields, key) {
            existingConfig[key] = value
        }
    }
    
    // 写入文件
    newBytes, _ := json.MarshalIndent(existingConfig, "", "  ")
    if err := os.WriteFile("config.json", newBytes, 0644); err != nil {
        ctx.JSON(http.StatusInternalServerError, gin.H{"error": "保存配置失败"})
        return
    }
    
    // 热加载到 global.Config
    json.Unmarshal(newBytes, &global.Config)
    
    ctx.JSON(http.StatusOK, gin.H{"message": "配置已更新并生效"})
}

func contains(slice []string, item string) bool {
    for _, s := range slice {
        if s == item {
            return true
        }
    }
    return false
}
```

### 1.2 注册路由 `backend/router/router.go`

在 `apiGroup` 中添加：

```go
// 13. 配置管理
configApi := new(api.ConfigApi)
apiGroup.GET("/config", configApi.GetConfig)
apiGroup.PUT("/config", configApi.UpdateConfig)
```

### 1.3 补充配置字段 `backend/global/global.go`

已有字段确认，新增字段已在 Spec 中定义：
- `LlmContextWindow`, `LlmMaxOutputTokens`, `LlmReservedTokens`, `LlmBufferTokens`
- 这些字段已在 `global.go:51-55` 定义，但需要添加默认值处理

### 1.4 验证点

- ✅ `GET /api/config` 返回非敏感配置
- ✅ `PUT /api/config` 保存成功，文件持久化
- ✅ 保存后 `global.Config` 热加载生效

---

## Phase 2: 前端页面

### 2.1 新增 `frontend/src/api/configApi.js`

```javascript
import { request } from './client';

const API_BASE = '/api';

export const getConfig = async () => {
    const res = await request(`${API_BASE}/config`);
    if (!res.ok) throw new Error('获取配置失败');
    return await res.json();
};

export const updateConfig = async (config) => {
    const res = await request(`${API_BASE}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存配置失败');
    }
    return await res.json();
};
```

### 2.2 新增 `frontend/src/components/settings/ModelConfigTab.jsx`

**组件结构**:

```
ModelConfigTab.jsx
├── ApiConfigSection      # 5类 API 配置
│   ├── LlmApiCard
│   ├── VlmApiCard
│   ├── EmbeddingCard
│   ├── PaddleCard
│   └── ImageGenCard
├── ChunkConfigSection    # 分片配置
├── ContextConfigSection  # 上下文窗口配置（新增）
└── SaveButton            # 保存按钮 + Toast
```

**UI 模式** (复用现有 `ServerTab.jsx` / `VectorTab.jsx` 风格):

- 左侧：配置卡片列表（滚动）
- 右侧：预览/说明面板
- Token 字段：遮罩 + 复制按钮

### 2.3 注册 Tab `frontend/src/components/SettingsModal.jsx`

```jsx
// 新增导入
import ModelConfigTab from './settings/ModelConfigTab';

// TABS 数组新增
{ id: 'model', label: '模型配置', icon: Cpu, description: '管理 API 密钥与上下文窗口' },

// 渲染条件新增
{activeTab === 'model' && <ModelConfigTab />}
```

### 2.4 验证点

- ✅ Tab 入口显示在设置面板左侧
- ✅ 配置数据从 API 加载并渲染
- ✅ Token 字段遮罩显示，点击可复制
- ✅ 保存按钮触发 API 调用
- ✅ 保存成功显示 Toast 提示

---

## Phase 3: 集成改造

### 3.1 改造 `backend/service/query_loop.go`

**当前问题**: 硬编码阈值计算

```go
// 当前代码 (query_loop.go:641-650)
func getModelMaxTokens() int {
    return 32000  // ❌ 硬编码
}

func getReservedTokens() int {
    return 8000   // ❌ 硬编码
}

func getBufferTokens() int {
    return 4000   // ❌ 硬编码
}
```

**改造方案**: 动态读取配置

```go
func getModelMaxTokens() int {
    if global.Config.LlmContextWindow > 0 {
        return global.Config.LlmContextWindow  // 从配置读取
    }
    return 32000  // 兜底默认值
}

func getReservedTokens() int {
    if global.Config.LlmReservedTokens > 0 {
        return global.Config.LlmReservedTokens
    }
    return 8000
}

func getBufferTokens() int {
    if global.Config.LlmBufferTokens > 0 {
        return global.Config.LlmBufferTokens
    }
    return 4000
}
```

### 3.2 改造 `backend/pkg/llm.go`

**AskAIWithConfig** 函数已支持 `maxTokensOverride`，需确保使用配置值：

```go
maxTokens := global.Config.LlmMaxOutputTokens
if maxTokens <= 0 {
    maxTokens = 8192  // DeepSeek V4 默认值应更新为 384000
}
```

### 3.3 验证点

- ✅ `query_loop.go` 动态读取配置值
- ✅ 配置修改后，下次 LLM 调用使用新阈值
- ✅ 深上下文场景（>500K tokens）不触发误截断

---

## 实现顺序

| 步骤 | 任务 | 依赖 | 预估时间 |
|------|------|------|----------|
| 1 | 创建 `config_api.go` | 无 | 15min |
| 2 | 注册路由 | 步骤1 | 5min |
| 3 | 创建 `configApi.js` | 步骤1 | 10min |
| 4 | 创建 `ModelConfigTab.jsx` | 步骤3 | 30min |
| 5 | 注册 Tab | 步骤4 | 5min |
| 6 | 改造 `query_loop.go` | 步骤2 | 10min |
| 7 | 改造 `llm.go` | 步骤2 | 5min |
| 8 | 集成测试 | 步骤1-7 | 15min |

**总预估**: ~1.5 小时

---

## 风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 配置文件损坏 | 服务无法启动 | 保存前备份 `config.json.bak` |
| 热加载失败 | 配置不生效 | 添加错误日志，提示重启 |
| Token 泄露 | 安全风险 | 严格过滤敏感字段 |
| 大上下文测试 | 可能超限 | 提供默认推荐值（DeepSeek V4 规格） |

---

## 文件清单

**新增文件**:
- `backend/api/config_api.go`
- `frontend/src/api/configApi.js`
- `frontend/src/components/settings/ModelConfigTab.jsx`

**修改文件**:
- `backend/router/router.go` (注册路由)
- `backend/service/query_loop.go` (动态读取)
- `backend/pkg/llm.go` (默认值更新)
- `frontend/src/components/SettingsModal.jsx` (注册 Tab)
- `backend/config.json` (补充新配置字段)