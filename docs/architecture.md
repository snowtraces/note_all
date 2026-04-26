# 技术架构详解

Note All 采用模块化、轻量级的设计理念，核心是一个以 AI 为驱动的碎片化知识收集与检索系统。

## 系统概览 (System Overview)

```mermaid
graph TD
    subgraph 收集端 Ingestors
        AC[Android 客户端]
        PC[Windows 托盘程序]
        BE[浏览器扩展]
        WB[微信机器人]
    end

    subgraph 后端服务 Backend
        API[Gin API 网关]
        PROC[处理流水线 Processor]
        RAG[RAG 引擎]
        AGENT[多轮对话 Agent]
        DB[(SQLite FTS5)]
        VEC[(向量存储 Vector Store)]
    end

    subgraph 前端展示 Frontend
        WEB[React Web 控制台]
    end

    AC & PC & BE & WB --> API
    API --> PROC
    PROC --> DB & VEC
    WEB <--> API
    RAG <--> DB & VEC
    AGENT <--> RAG
```

## RAG 检索流水线

RAG (Retrieval-Augmented Generation, 检索增强生成) 系统遵循“宽进严排”的原则，确保高召回率与精准度。

### 1. 意图探测 (Intent Detection)
当查询进入系统时，首先通过 LLM/规则分析其意图类型：是普通搜索、总结请求、还是基于某些文档的提问。

### 2. 混合检索 (Hybrid Search)
系统并行开启三个维度的检索通道：
- **向量检索 (Vector Search)**：捕获语义相关性 (使用本地或云端嵌入模型)。
- **全文检索 (FTS5)**：基于 SQLite FTS5 引擎，捕获 OCR 文本和摘要中的精确匹配。
- **标签雷达 (Tag Matching)**：对匹配用户定义标签的笔记进行高权重加分。

### 3. 多维重排 (Re-ranking)
搜索结果通过加权公式进行合并与排序：
`最终得分 = 向量相似度(50%) + 全文匹配(25%) + 标签命中(15%) + 时效性权重(10%)`

## 多轮对话 Agent 设计

Agent 系统允许用户进行连续追问，并能执行复杂的任务指令。

### 意图状态机
Agent 追踪以下意图状态：
- `new_topic`：开启新话题。
- `follow_up`：指代追问 (例如：“它的特点是什么？”)。
- `clarify`：请求对上一步回答进行展开或澄清。
- `switch`：主动切换对话主题。
- `multi_step`：多步任务 (例如：“先找关于 X 的笔记，然后总结 Y”)。

### 查询重写 (Query Rewriting)
对于追问类问题，Agent 会结合上下文重写查询词。例如将“它的特点”重写为“设计模式的特点”，确保检索引擎能获取正确的信息。

更多底层实现细节请参考 [Agent 设计深度解析](design/agent.md)。

## 数据库设计

Note All 使用 **SQLite** 存储所有数据，强调零维护和便携性。

- **Notes 表**：存储核心内容、元数据及 OCR 结果。
- **Chunks 表**：将笔记切片，用于向量索引。
- **ChatSessions 表**：持久化多轮对话历史。
- **Templates 表**：存储自定义的 AI 处理 Prompt 模版。

## 客户端生态

- **WeChat ClawBot**：基于 iLink 协议，将微信变为知识收集的入口。
- **Android 分享集成**：深度集成系统分享面板，实现一键收录。
- **Windows 全局热键**：利用 Win32 API 实现 `Alt+Q` (截图) 和 `Alt+Shift+Q` (闪记) 的系统级唤起。
