# Tasks: 模型配置管理页面实现

## 任务清单

按依赖顺序排列，每个任务可在单次 session 内完成。

---

### Task 1: 创建配置 API Handler

- [ ] **Task**: 创建 `backend/api/config_api.go`，实现 `GetConfig` 和 `UpdateConfig` 方法
  - **Acceptance**:
    - `GetConfig` 返回非敏感配置（过滤 `sys_password`, `jwt_secret`, `mcp_token`）
    - `UpdateConfig` 合并更新配置，保留敏感字段不变
    - 保存后热加载到 `global.Config`
  - **Verify**: 单元测试或手动调用 API
  - **Files**: `backend/api/config_api.go` (新增)

---

### Task 2: 注册配置 API 路由

- [ ] **Task**: 在 `backend/router/router.go` 中注册配置 API 路由
  - **Acceptance**:
    - `GET /api/config` 路由可访问
    - `PUT /api/config` 路由可访问
    - 路由在鉴权组内（需 token）
  - **Verify**: 启动服务，`curl http://localhost:3344/api/config` 测试
  - **Files**: `backend/router/router.go` (修改)

---

### Task 3: 创建前端配置 API 封装

- [ ] **Task**: 创建 `frontend/src/api/configApi.js`
  - **Acceptance**:
    - `getConfig()` 封装 GET 请求
    - `updateConfig(config)` 封装 PUT 请求
    - 错误处理返回友好信息
  - **Verify**: 在浏览器 console 测试调用
  - **Files**: `frontend/src/api/configApi.js` (新增)

---

### Task 4: 创建模型配置页面组件

- [ ] **Task**: 创建 `frontend/src/components/settings/ModelConfigTab.jsx`
  - **Acceptance**:
    - 渲染 5 类 API 配置卡片（LLM、VLM、Embedding、Paddle、ImageGen）
    - 渲染分片配置卡片（4 项）
    - 渲染上下文窗口配置卡片（5 项）
    - Token 字段遮罩显示 + 复制按钮
    - 保存按钮触发 API 调用
    - 成功/失败 Toast 提示
  - **Verify**: 在设置面板打开页面，检查渲染
  - **Files**: `frontend/src/components/settings/ModelConfigTab.jsx` (新增)

---

### Task 5: 注册模型配置 Tab

- [ ] **Task**: 在 `SettingsModal.jsx` 中注册新 Tab
  - **Acceptance**:
    - TABS 数组新增 `{ id: 'model', label: '模型配置', icon: Cpu }`
    - 渲染条件新增 `activeTab === 'model' && <ModelConfigTab />`
    - Tab 入口显示在左侧导航
  - **Verify**: 打开设置面板，点击"模型配置" Tab
  - **Files**: `frontend/src/components/SettingsModal.jsx` (修改)

---

### Task 6: 改造 query_loop 动态读取配置

- [ ] **Task**: 修改 `backend/service/query_loop.go` 中的硬编码值
  - **Acceptance**:
    - `getModelMaxTokens()` 读取 `global.Config.LlmContextWindow`
    - `getReservedTokens()` 读取 `global.Config.LlmReservedTokens`
    - `getBufferTokens()` 读取 `global.Config.LlmBufferTokens`
    - 保留兜底默认值
  - **Verify**: 修改配置后调用 LLM，检查截断阈值
  - **Files**: `backend/service/query_loop.go` (修改)

---

### Task 7: 改造 llm.go 默认值

- [ ] **Task**: 修改 `backend/pkg/llm.go` 中的默认输出 token
  - **Acceptance**:
    - `AskAIWithConfig` 使用 `global.Config.LlmMaxOutputTokens`
    - 默认值从 8192 更新为 384000（DeepSeek V4 规格）
  - **Verify**: 调用 LLM 检查 `max_completion_tokens` 参数
  - **Files**: `backend/pkg/llm.go` (修改)

---

### Task 8: 补充 config.json 默认配置

- [ ] **Task**: 在 `backend/config.json` 中添加上下文窗口配置字段
  - **Acceptance**:
    - 新增 `llm_context_window: 1000000`
    - 新增 `llm_max_output_tokens: 384000`
    - 新增 `llm_reserved_tokens: 400000`
    - 新增 `llm_buffer_tokens: 100000`
    - 新增 `rag_context_limit: 12000`（已有则保留）
  - **Verify**: 启动服务，检查配置加载
  - **Files**: `backend/config.json` (修改)

---

### Task 9: 集成测试与验证

- [ ] **Task**: 执行完整流程测试
  - **Acceptance**:
    - 前端打开设置页面 → 模型配置 Tab 正常显示
    - 配置数据从 API 加载并渲染
    - 修改配置 → 保存成功 → Toast 显示
    - 后端日志显示配置热加载
    - 调用 Agent Ask 验证截断策略生效
  - **Verify**: 全流程手动测试
  - **Files**: 无新增

---

## 任务依赖图

```
Task 1 ──→ Task 2 ──→ Task 3 ──→ Task 4 ──→ Task 5
   │          │          │
   └──→ Task 6 ──→ Task 7 ──→ Task 8 ──→ Task 9
```

## 实现顺序建议

**并行执行**:
- Task 1 + Task 8 (后端独立)
- Task 3 + Task 4 (前端独立，Task 3 先完成)

**顺序执行**:
- Task 1 → Task 2 (路由依赖 API)
- Task 4 → Task 5 (Tab 注册依赖组件)
- Task 2 → Task 6/7 (改造依赖 API 可用)

---

## 验收检查清单

完成所有任务后，确认：

- [ ] `GET /api/config` 返回非敏感配置
- [ ] `PUT /api/config` 保存并热加载
- [ ] 前端"模型配置" Tab 可访问
- [ ] Token 字段遮罩显示
- [ ] 配置修改后 Toast 提示成功
- [ ] `query_loop.go` 动态读取配置值
- [ ] DeepSeek V4 (1M context) 不触发误截断