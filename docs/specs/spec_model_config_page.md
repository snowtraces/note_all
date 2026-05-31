# Spec: 模型配置管理页面

## Objective

设计并实现一个**模型配置管理页面**，覆盖 `config.json` 中除敏感字段外的所有配置项，新增**上下文窗口配置**用于调整 LLM 截断策略。

**用户故事**:
- 用户可以在前端查看和修改所有模型 API 配置（LLM、VLM、Embedding、Paddle OCR、图片生成）
- 用户可以配置上下文窗口参数，控制 LLM 调用时的截断阈值
- 用户可以配置分片参数，控制文档向量化的粒度
- 配置修改后实时生效，无需重启服务

**排除字段** (安全敏感，不暴露):
- `sys_password` - 系统密码
- `jwt_secret` - JWT 密钥
- `mcp_token` - MCP 服务 Token

## Tech Stack

- **前端**: React 18 + Tailwind CSS (复用现有组件模式)
- **后端**: Go + Gin (新增配置读写 API)
- **配置存储**: `backend/config.json` (文件持久化)

## Commands

```bash
# 前端开发
cd frontend && npm run dev

# 后端开发
cd backend && go run main.go

# 构建
cd frontend && npm run build
cd backend && go build -o note_all_backend.exe
```

## Project Structure

```
frontend/src/
  components/settings/
    ModelConfigTab.jsx     # 新增：模型配置页面主组件
    ContextConfigCard.jsx  # 新增：上下文窗口配置卡片
    ApiConfigCard.jsx      # 新增：API 配置卡片（通用模板）

frontend/src/api/
  configApi.js             # 新增：配置读写 API 封装

backend/api/
  config_api.go            # 新增：配置读写 API Handler

backend/global/
  global.go                # 已有：配置结构定义（补充字段）

backend/config.json        # 已有：配置文件（补充新字段）
```

## Code Style

遵循项目现有 React 组件风格：

```jsx
// 卡片组件模板
export default function ApiConfigCard({ title, fields, onChange }) {
  return (
    <div className="rounded-xl p-5 bg-bgSubtle border border-borderSubtle">
      <div className="text-[11px] uppercase tracking-wider mb-3 font-mono text-textTertiary">
        {title}
      </div>
      <div className="space-y-4">
        {fields.map(field => (
          <ConfigInput
            key={field.key}
            label={field.label}
            value={field.value}
            type={field.type || 'text'}
            onChange={(v) => onChange(field.key, v)}
          />
        ))}
      </div>
    </div>
  );
}
```

## Testing Strategy

- **单元测试**: 后端 API 测试 (`config_api_test.go`)
- **集成测试**: 配置保存后重启服务验证生效
- **手动验证**: 前端页面交互，配置修改后调用 LLM 验证截断策略

## Boundaries

- **Always**:
  - 敏感字段 (`sys_password`, `jwt_secret`, `mcp_token`) 永不暴露到前端
  - Token 类字段在前端显示为遮罩（点击可复制）
  - 配置保存前验证必填字段

- **Ask first**:
  - 新增配置字段到 `global.go` 结构体
  - 修改 `config.json` 文件格式

- **Never**:
  - 在前端明文显示 API Token
  - 删除现有配置字段（需向后兼容）

## Success Criteria

1. ✅ 前端新增 **"模型配置"** Tab，包含 5 类配置卡片
2. ✅ 配置页面可读写所有非敏感配置项
3. ✅ 新增上下文窗口配置卡片，包含 4 个参数
4. ✅ 后端新增 `GET /api/config` 和 `PUT /api/config` API
5. ✅ 配置修改后 `query_loop.go` 动态读取配置值（非硬编码）
6. ✅ 配置保存成功后显示 Toast 提示

## Open Questions

1. **配置生效时机**: 是否需要重启服务？还是热加载？
   - 建议：热加载，修改后立即生效

2. **Token 显示方式**: 完全遮罩还是部分显示？
   - 建议：遮罩 + 复制按钮（点击复制完整值）

3. **配置验证**: 是否需要测试 API 连通性？
   - 建议：提供"测试连接"按钮，可选执行

---

## 附录：配置项清单

### A. API 配置（5 类）

| 类别 | 字段 | 说明 | 类型 |
|------|------|------|------|
| **LLM API** | `llm_api_url` | API 地址 | text |
| | `llm_api_token` | Token | password |
| | `llm_model_id` | 模型 ID | text |
| **VLM API** | `vlm_api_url` | API 地址 | text |
| | `vlm_api_token` | Token | password |
| | `vlm_model_id` | 模型 ID | text |
| **Embedding** | `embedding_model_id` | 模型 ID | text |
| | `embedding_api_url` | 本地 API | text |
| | `embedding_api_url_cloud` | 云端 API | text |
| **Paddle OCR** | `paddle_api_url` | API 地址 | text |
| | `paddle_token` | Token | password |
| **图片生成** | `image_api_url` | API 地址 | text |
| | `image_api_token` | Token | password |

### B. 分片配置（4 项）

| 字段 | 默认值 | 说明 | 类型 |
|------|--------|------|------|
| `chunk_max_size` | 500 | 单片最大字符数 | number |
| `chunk_min_size` | 100 | 单片最小字符数 | number |
| `chunk_overlap` | 50 | 重叠字符数 | number |
| `chunk_max_per_doc` | 100 | 单文档最大分片数 | number |

### C. 上下文窗口配置（5 项新增）

| 字段 | 默认值 | 说明 | 类型 |
|------|--------|------|------|
| `rag_context_limit` | 12000 | RAG 上下文长度限制（字符数） | number |
| `llm_context_window` | 1000000 | 模型上下文窗口（DeepSeek V4 = **1M tokens**） | number |
| `llm_max_output_tokens` | 384000 | 输出最大 token 数（DeepSeek V4 = **384K**） | number |
| `llm_reserved_tokens` | 400000 | 为输出预留的 token | number |
| `llm_buffer_tokens` | 100000 | 恢复预留 buffer | number |

> **DeepSeek V4 规格** (2026.05):
> - Flash/Pro 两版本均支持 **1M context**
> - 输出上限 **384K tokens**
> - 支持思考模式（可切换）

---

## 技术实现计划

### Phase 1: 后端 API

1. 新增 `backend/api/config_api.go`
   - `GetConfig()` - 返回非敏感配置
   - `UpdateConfig()` - 更新配置文件

2. 修改 `backend/global/global.go`
   - 确保所有配置字段已定义

3. 修改 `backend/service/query_loop.go`
   - 动态读取 `global.Config` 而非硬编码

### Phase 2: 前端页面

1. 新增 `frontend/src/api/configApi.js`
   - `getConfig()` / `updateConfig(config)`

2. 新增 `frontend/src/components/settings/ModelConfigTab.jsx`
   - 使用现有卡片样式
   - 分组展示配置项

3. 修改 `frontend/src/components/SettingsModal.jsx`
   - 新增 Tab 入口

### Phase 3: 集成验证

1. 测试配置读写流程
2. 验证截断策略生效
3. 添加 Toast 提示反馈