# SPEC: Phase D3 任务视图 🔻 [降级]

> **状态**: 🔻 已降级（原 Phase A3）
> **降级原因**: 实用性中等偏低、与核心定位有偏差、外部工具更成熟
> **新定位**: 作为 B2 多维视图的一种，而非独立任务系统
> **优先级**: 🔵 P2（原 P0）
> **预计交付**: 2027 Q2

## 1. Objective

### 1.1 功能定位

智能任务萃取是 Note All 从"碎片收集工具"升级为"数字管家"的关键功能。通过 AI 自动识别碎片中的待办事项、行动建议和任务线索，帮助用户将被动记录转化为主动执行。

### 1.2 目标用户

- 个人知识管理者：日常收集大量碎片，其中包含隐含的任务项
- 项目推进者：需要从会议记录、灵感笔记中提取行动点
- 自律型用户：希望系统帮助追踪碎片中的承诺与计划

### 1.3 核心价值

| 价值点 | 说明 |
|-------|------|
| 自动识别 | AI 自动提取"待办/行动/建议/计划"类语句 |
| 结构管理 | 任务状态流转（待处理→进行中→已完成/已放弃/延期） |
| 知识关联 | 任务与原始碎片双向链接，溯源执行依据 |
| 全局视角 | 跨碎片的任务聚合视图，统一管理待办 |

### 1.4 验收标准

1. 用户在碎片详情页点击"提取任务"按钮，AI 返回识别结果
2. 用户可确认/编辑提取的任务，保存至任务列表
3. 任务支持五态状态管理（待处理/进行中/已完成/已放弃/延期）
4. 碎片详情页显示该碎片关联的任务列表
5. 全局任务视图页聚合所有碎片的任务，支持筛选与排序
6. 任务完成时，可选自动更新源碎片状态

---

## 2. Commands

### 2.1 后端 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/notes/:id/tasks` | POST | 对指定碎片执行任务识别 |
| `/api/notes/:id/tasks` | GET | 获取指定碎片的任务列表 |
| `/api/tasks` | GET | 获取全局任务列表（支持筛选） |
| `/api/tasks/:id` | PUT | 更新任务状态/内容 |
| `/api/tasks/:id` | DELETE | 删除任务 |
| `/api/tasks/batch` | PUT | 批量更新任务状态 |

### 2.2 API 详细设计

#### POST `/api/notes/:id/tasks` - 任务识别

**Request**:
```json
{
  "mode": "extract"  // extract: 新提取, reextract: 重新提取
}
```

**Response**:
```json
{
  "data": {
    "detected_tasks": [
      {
        "content": "下周三前完成项目报告",
        "type": "deadline",
        "priority": "high",
        "context": "会议纪要中提到的行动项"
      }
    ],
    "total": 3
  }
}
```

#### GET `/api/tasks` - 全局任务列表

**Query Parameters**:
- `status`: 筛选状态 (pending/in_progress/completed/abandoned/delayed)
- `priority`: 筛选优先级 (high/medium/low)
- `sort`: 排序字段 (created_at/updated_at/priority)
- `order`: 排序方向 (asc/desc)
- `page`: 分页页码
- `limit`: 每页数量

**Response**:
```json
{
  "data": [
    {
      "id": 1,
      "note_id": 42,
      "content": "下周三前完成项目报告",
      "status": "pending",
      "priority": "high",
      "created_at": "2026-05-02T10:00:00Z",
      "updated_at": "2026-05-02T10:00:00Z",
      "note_summary": "项目会议纪要"
    }
  ],
  "total": 15,
  "page": 1
}
```

#### PUT `/api/tasks/:id` - 更新任务

**Request**:
```json
{
  "status": "completed",
  "content": "已完成项目报告",
  "update_note_status": true  // 是否同步更新源碎片状态
}
```

---

## 3. Project Structure

### 3.1 后端新增文件

```
backend/
├── models/
│   └── task.go              # Task 模型定义
├── api/
│   └── task.go              # Task API 端点
├── service/
│   ├── task.go              # Task 业务逻辑
│   └── task_extractor.go    # AI 任务识别 Prompt 与逻辑
└── router/
│   └── router.go            # 注册 Task 路由 (修改现有文件)
```

### 3.2 前端新增文件

```
frontend/src/
├── components/
│   ├── TaskPanel.jsx        # 碎片详情页任务面板
│   ├── TaskView.jsx         # 全局任务视图页面
│   └── TaskCard.jsx         # 任务卡片组件
├── api/
│   └── taskApi.js           # Task API 调用封装
├── context/
│   └── TaskContext.jsx      # 任务状态 Context (可选)
```

### 3.3 数据库模型

```go
// models/task.go

type Task struct {
    ID        uint           `gorm:"primaryKey" json:"id"`
    CreatedAt time.Time      `json:"created_at"`
    UpdatedAt time.Time      `json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`

    // 关联碎片
    NoteID    uint   `gorm:"not null;index" json:"note_id"`

    // 任务内容
    Content   string `gorm:"type:text;not null" json:"content"`
    Type      string `gorm:"size:32" json:"type"`       // todo/action/suggestion/deadline
    Priority  string `gorm:"size:16" json:"priority"`   // high/medium/low
    Context   string `gorm:"size:255" json:"context"`   // AI 提取时的上下文描述

    // 状态管理 (五态)
    Status    string `gorm:"size:32;default:'pending'" json:"status"`  // pending/in_progress/completed/abandoned/delayed

    // 元数据
    DueDate   *time.Time `json:"due_date"`       // 截止日期（可选）
    SourceText string    `gorm:"type:text" json:"source_text"` // 提取原文片段
}
```

---

## 4. Code Style

### 4.1 后端规范

- 遵循现有项目 Go 代码风格
- 使用 GORM 进行数据库操作
- API 端点返回格式保持一致：`{ "data": ..., "message": ... }`
- 错误处理返回 `{ "error": "描述信息" }`

### 4.2 前端规范

- 遵循现有 React + TailwindCSS 风格
- 使用 Lucide React 图标库
- 组件命名：PascalCase
- API 调用封装在 `api/` 目录

### 4.3 AI Prompt 设计

```text
你是一个任务提取专家。请分析以下文本，识别其中隐含的任务项。

任务类型包括：
- todo: 明确的待办事项
- action: 需要执行的行动
- suggestion: 建议性事项
- deadline: 有明确截止时间的事项

请以 JSON 格式返回识别结果：
[
  {
    "content": "任务内容",
    "type": "任务类型",
    "priority": "high/medium/low",
    "context": "上下文说明"
  }
]

注意：
1. 仅提取明确的任务项，不要推断模糊内容
2. 保留原文的关键信息（如截止日期、负责人）
3. 如果没有任务项，返回空数组 []

待分析文本：
{ocr_text}
```

---

## 5. Testing Strategy

### 5.1 后端测试

| 测试类型 | 内容 |
|---------|------|
| 单元测试 | Task 模型 CRUD 操作 |
| 单元测试 | 任务识别 Prompt 输出解析 |
| 集成测试 | API 端点请求/响应格式 |
| 边界测试 | 无任务文本、空文本、超长文本 |

### 5.2 前端测试

| 测试类型 | 内容 |
|---------|------|
| 组件测试 | TaskPanel 渲染与交互 |
| 组件测试 | TaskView 筛选与排序 |
| E2E 测试 | 手动触发提取 → 确认保存 → 状态更新流程 |

### 5.3 验收测试用例

```
TC1: 基础任务提取
- 输入：包含"明天下午三点开会"的碎片
- 操作：点击"提取任务"
- 期望：识别出任务项，显示截止日期建议

TC2: 无任务文本处理
- 输入：纯知识性内容"量子计算的基本原理..."
- 操作：点击"提取任务"
- 期望：返回"未检测到任务项"

TC3: 多任务提取
- 输入：会议纪要含多个行动项
- 操作：点击"提取任务"
- 期望：识别出所有任务项，支持逐条确认

TC4: 状态流转
- 操作：任务状态从 pending → in_progress → completed
- 期望：状态历史记录，可选同步碎片状态

TC5: 全局任务聚合
- 前置：多个碎片各有任务
- 操作：进入全局任务视图
- 期望：按优先级/状态筛选，按时间排序
```

---

## 6. Boundaries

### 6.1 Always Do

- ✅ 任务与源碎片强关联，支持溯源跳转
- ✅ 使用现有 LLM 服务（pkg/llm.go）进行识别
- ✅ 任务状态变更记录时间戳
- ✅ 前端复用现有 UI 风格（glass-panel、primeAccent）
- ✅ API 遵循现有认证机制（middleware/auth.go）

### 6.2 Ask First About

- ⚠️ 任务识别的具体 Prompt 模板内容
- ⚠️ 任务优先级的判定规则（AI 自动判定 vs 用户手动设置）
- ⚠️ 截止日期的解析逻辑（是否支持中文日期如"下周三"）
- ⚠️ 任务删除是物理删除还是软删除
- ⚠️ 是否需要任务备注字段

### 6.3 Never Do

- ❌ 不自动触发任务识别（Phase A3 仅支持手动触发）
- ❌ 不与外部工具联动（TickTick/Todoist 等）
- ❌ 不改变现有 NoteItem 模型核心字段
- ❌ 不创建独立的用户系统（沿用现有单用户模式）
- ❌ 不引入新的第三方依赖包（使用现有 LLM 客户端）

---

## 7. Implementation Phases

### Phase 1: 后端模型与 API（预计 2 天）

1. 创建 Task 模型（models/task.go）
2. 注册数据库迁移
3. 实现 Task API 端点（api/task.go）
4. 实现基础 CRUD 服务（service/task.go）

### Phase 2: AI 任务识别（预计 1 天）

1. 设计任务识别 Prompt
2. 实现 task_extractor.go
3. 集成 LLM 调用与结果解析
4. 测试识别准确率

### Phase 3: 前端碎片详情页集成（预计 2 天）

1. 创建 TaskPanel.jsx 组件
2. 创建 TaskCard.jsx 子组件
3. 集成到 Detail.jsx 右侧栏
4. 实现"提取任务"按钮与结果展示

### Phase 4: 前端全局任务视图（预计 2 天）

1. 创建 TaskView.jsx 页面
2. 实现筛选与排序 UI
3. 集成 NavRail 导航入口
4. 实现任务状态快捷操作

### Phase 5: 测试与验收（预计 1 天）

1. 编写后端单元测试
2. 编写前端组件测试
3. E2E 流程验收
4. 修复发现的问题

---

## 8. Dependencies

| 依赖项 | 说明 |
|-------|------|
| pkg/llm.go | 现有 LLM 客户端，用于任务识别 |
| models/note.go | NoteItem 模型，Task 关联 NoteID |
| api/note.go | 现有 API 结构，需注册新路由 |
| middleware/auth.go | 认证中间件，复用现有机制 |
| frontend/src/components/Detail.jsx | 详情页，需集成 TaskPanel |

---

*文档版本: 1.0 | 创建日期: 2026-05-02*