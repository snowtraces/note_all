# Spec: Phase A2 - AI 主动启发

## Objective

将 AI 从被动响应升级为主动思维伴侣，在用户浏览碎片时主动推送关联提示，激发深度思考。

**用户故事**:
- 当用户打开碎片详情页时，AI 自动推送"这与 X 知识有何联系？"的启发式提示
- 用户可以看到基于向量相似度的相关碎片推荐（而非仅基于标签）
- 用户每日/每周收到 AI 生成的知识回顾摘要
- AI 能够跨碎片发现观点冲突或逻辑缝隙，主动提醒用户

**验收标准**: 详情页显示 AI 主动推送的关联提示 + 相关碎片推荐（向量相似度）

## Tech Stack

**现有基础设施**:
- 前端: React 18 + Vite 5 + Tailwind CSS
- 后端: Go + Gin + GORM + SQLite (FTS5)
- 向量嵌入: Python Flask + sentence-transformers (BGE-small-zh-v1.5)
- 分片向量存储: `NoteChunk` + `NoteChunkEmbedding`
- SSE 实时推送: `SSEBus`

**新增依赖**:
- 定时任务调度: Go 内置 `time.Ticker` 或 `robfig/cron`
- 向量相似度查询优化: 现有 `CosineSimilarity` 函数

## Commands

```bash
# 前端开发
cd frontend && npm run dev

# 前端构建
cd frontend && npm run build

# 后端运行
cd backend && go run main.go

# 向量嵌入服务
cd backend && python embedding_server.py

# 测试（待补充）
cd backend && go test ./...
```

## Project Structure

```
backend/
├── api/
│   ├── note.go          # 现有碎片 API
│   ├── insight.go       # [新增] AI 启发 API
│   └── review.go        # [新增] 定期回顾 API
├── service/
│   ├── note.go          # 现有碎片服务
│   ├── related.go       # [新增] 向量相似度服务
│   ├── insight.go       # [新增] AI 启发生成服务
│   ├── review.go        # [新增] 定期回顾生成服务
│   └── contradiction.go # [新增] 矛盾检测服务
├── models/
│   ├── note.go          # 现有数据模型
│   ├── insight.go       # [新增] AI 启发记录模型
│   └── review.go        # [新增] 定期回顾记录模型
├── scheduler/
│   └── review.go        # [新增] 定时任务调度器
└── main.go              # 启动入口

frontend/src/
├── components/
│   ├── Detail.jsx       # 现有详情页（需扩展）
│   ├── InsightPanel.jsx # [新增] AI 启发面板组件
│   ├── RelatedPanel.jsx # [新增] 相关碎片推荐面板
│   └── ReviewToast.jsx  # [新增] 定期回顾提醒组件
├── api/
│   ├── noteApi.js       # 现有 API
│   └── insightApi.js    # [新增] AI 启发 API
└── hooks/
    └── useInsight.js    # [新增] AI 启发数据 Hook
```

## Code Style

**Go 后端风格**:
```go
// 服务层函数命名: 动词 + 名词
func GenerateInsight(noteID uint) (*Insight, error) {
    // 1. 获取碎片内容
    var note models.NoteItem
    if err := global.DB.First(&note, noteID).Error; err != nil {
        return nil, fmt.Errorf("碎片不存在: %v", err)
    }

    // 2. 获取相似碎片
    related, err := GetRelatedByVector(noteID, 5)
    if err != nil {
        return nil, err
    }

    // 3. 调用 LLM 生成启发式提示
    prompt := buildInsightPrompt(note, related)
    insightText, err := pkg.AskAI(prompt, insightSystemPrompt)
    if err != nil {
        return nil, err
    }

    return &Insight{NoteID: noteID, Content: insightText}, nil
}
```

**React 前端风格**:
```jsx
// 组件命名: 功能 + Panel/View/Modal
export default function InsightPanel({ noteId, relatedItems }) {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!noteId) return;
    setLoading(true);
    getInsight(noteId).then(data => {
      setInsight(data);
      setLoading(false);
    }).catch(err => console.error(err));
  }, [noteId]);

  if (loading) return <InsightSkeleton />;
  if (!insight) return null;

  return (
    <div className="insight-panel">
      <MarkdownRenderer content={insight.content} />
    </div>
  );
}
```

## Testing Strategy

**单元测试**:
- `service/related.go`: 向量相似度计算准确性
- `service/insight.go`: AI 启发生成逻辑
- `service/contradiction.go`: 矛盾检测算法

**集成测试**:
- API 端点: `/api/note/:id/insight`, `/api/note/:id/related/vector`
- SSE 推送: 定期回顾提醒事件

**测试命令**: `go test ./service/... ./api/... -v`

**覆盖率目标**: 核心服务层 > 80%

## Boundaries

**Always do**:
- 使用现有向量嵌入服务（BGE-small-zh），不更换模型
- 复用现有 SSE 推送机制
- 异步执行 LLM 调用，不阻塞主流程
- 所有 AI 生成内容存入数据库，便于追溯

**Ask first**:
- 更换向量嵌入模型
- 添加新的定时任务调度器依赖
- 修改前端 Detail.jsx 核心布局
- 增加外部 API 调用（如第三方 LLM）

**Never do**:
- 在前端直接调用 LLM API
- 同步等待 AI 生成完成再返回响应
- 删除现有基于标签的相关碎片推荐逻辑
- 将 AI 启发内容硬编码

## Success Criteria

**Phase A2 首次交付范围**（前三项功能）:

1. **详情页 AI 启发面板**: 打开碎片详情页后立即显示预生成的关联提示（异步预生成机制）
2. **向量相似度推荐**: 相关碎片推荐升级为基于向量相似度，而非仅基于标签匹配
3. **定期回顾提醒**: 用户点击"今日回顾"按钮后，AI 生成当日知识回顾摘要

**延后功能**（后续迭代）:
4. **矛盾检测**: 跨碎片观点冲突检测

**性能指标**:
- AI 启发预生成: 在碎片分析完成后异步执行，不阻塞主流程
- 向量相似度查询: < 500ms（利用现有分片向量索引）
- 定期回顾生成: < 10s（异步生成，前端显示加载状态）

## Open Questions

**已确认决策**:

1. **启发式提示生成时机**: ✅ 后台预生成 + 缓存
   - 碎片分析完成后自动触发启发式提示预生成
   - 用户打开详情页时直接展示，无需等待

2. **定期回顾摘要的触发方式**: ✅ 用户主动点击按钮触发
   - 在首页或侧边栏提供"今日回顾"入口
   - 点击后异步生成并展示

3. **矛盾检测的粒度**: 🔻 延后至后续迭代
   - Phase A2 首次交付聚焦前三项功能
   - 矛盾检测复杂度高，待核心功能稳定后再启动

4. **向量相似度阈值**:
   - 建议值: 0.75 以上视为"高度相关"
   - 需要实测调优

---

*最后更新: 2026-05-02 | 用户决策已确认*