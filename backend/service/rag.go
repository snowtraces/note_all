package service

import (
	"crypto/sha256"
	"fmt"
	"log"
	"math"
	"sort"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg"
	"note_all_backend/pkg/synonym"
)

// SearchResult 混合检索结果项 (使用匿名嵌套实现 JSON 扁平化，匹配前端渲染)
type SearchResult struct {
	models.NoteItem
	Score        float32 `json:"score"`
	VectorScore  float32 `json:"vector_score"`
	FtsScore     float32 `json:"fts_score"`
	TagScore     float32 `json:"tag_score"`
	RecencyScore float32 `json:"recency_score"`
	LinkScore    float32 `json:"link_score"`
}

// UpdateNoteEmbedding 生成或更新笔记的向量索引
func UpdateNoteEmbedding(nID uint) error {
	var note models.NoteItem
	if err := global.DB.First(&note, nID).Error; err != nil {
		return err
	}

	// 拼接内容: ai_summary + ocr_text
	content := fmt.Sprintf("%s\n%s", note.AiSummary, note.OcrText)
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	// 检查是否已有且 hash 一致
	var existing models.NoteEmbedding
	if err := global.DB.Where("note_id = ?", nID).First(&existing).Error; err == nil {
		if existing.Hash == hash {
			return nil // 无需更新
		}
	}

	// 调用接口获取向量
	vec, err := pkg.GetEmbedding(content)
	if err != nil {
		return fmt.Errorf("failed to get embedding: %v", err)
	}

	blob, err := models.Float32ToBytes(vec)
	if err != nil {
		return err
	}

	embedding := models.NoteEmbedding{
		NoteID:    nID,
		Embedding: blob,
		Hash:      hash,
	}

	return global.DB.Save(&embedding).Error
}

// BackfillNoteEmbeddings 补全历史笔记的向量索引
func BackfillNoteEmbeddings() error {
	var notes []models.NoteItem
	// 找到所有已分析但没有向量记录的笔记
	err := global.DB.Where("status IN ? AND id NOT IN (SELECT note_id FROM note_embeddings)", []string{"analyzed", "done"}).Find(&notes).Error
	if err != nil {
		return err
	}

	if len(notes) == 0 {
		return nil
	}

	log.Printf("[RAG] 发现 %d 条笔记需要补全向量索引...", len(notes))
	for _, n := range notes {
		if err := UpdateNoteEmbedding(n.ID); err != nil {
			log.Printf("[RAG] 补全向量失败 (ID:%d): %v", n.ID, err)
		} else {
			log.Printf("[RAG] 补全向量成功 (ID:%d)", n.ID)
		}
		// 避免请求过快，稍微停顿一下（如果模型服务在本地，其实不需要太久）
		time.Sleep(100 * time.Millisecond)
	}
	return nil
}

// HybridSearch 混合检索实现
func HybridSearch(query string, limit int) ([]SearchResult, error) {
	// 1. 获取查询向量
	queryVec, err := pkg.GetEmbedding(query)
	if err != nil {
		log.Printf("[HybridSearch] GetEmbedding failed: %v, falling back to non-vector search", err)
	}

	// 2. 向量检索 (全量拉取向量，内存计算相似度，适用于个人中小规模)
	var embeddings []models.NoteEmbedding
	global.DB.Find(&embeddings)

	vectorScores := make(map[uint]float32)
	if queryVec != nil {
		for _, e := range embeddings {
			vec, err := models.BytesToFloat32(e.Embedding)
			if err == nil {
				score := models.CosineSimilarity(queryVec, vec)
				if score > 0.5 { // 恢复基础阈值，保证基准召回
					vectorScores[e.NoteID] = score
				}
			}
		}
	}
	log.Printf("[HybridSearch] Vector hits: %d", len(vectorScores))

	// 3. FTS5 全文搜索
	var ftsResults []struct {
		ID    uint
		Score float32
	}
	// SQLite FTS5 bm25() 返回负值，越小越相关
	// 针对特殊字符（如 #）包裹引号以避免 syntax error
	ftsQuery := "\"" + strings.ReplaceAll(query, "\"", "") + "\""
	global.DB.Raw("SELECT rowid as id, -bm25(note_fts) as score FROM note_fts WHERE note_fts MATCH ? ORDER BY score DESC LIMIT 50", ftsQuery).Scan(&ftsResults)
	ftsScores := make(map[uint]float32)
	for _, r := range ftsResults {
		ftsScores[r.ID] = r.Score
	}
	log.Printf("[HybridSearch] FTS5 hits: %d", len(ftsScores))

	// 4. Tag 检索 (使用分词后的词组进行匹配)
	// 注意：此处不再调用会触发 AI 或复杂改写的 QueryRewrite，直接调用同义词包的分词
	expandedTags := synonym.RewriteQuery(query)
	var tagHits []struct {
		NoteID uint
		Count  int
	}
	global.DB.Table("note_tags").
		Select("note_id, COUNT(*) as count").
		Where("tag IN ?", expandedTags).
		Joins("JOIN note_items ON note_items.id = note_tags.note_id").
		Where("note_items.deleted_at IS NULL AND note_items.status IN ? AND note_items.is_archived = ?", []string{"analyzed", "done"}, false).
		Group("note_id").Scan(&tagHits)

	tagScores := make(map[uint]float32)
	for _, r := range tagHits {
		// 标签命中的基础分提高，确保标签相关的笔记排在前面
		tagScores[r.NoteID] = float32(r.Count) * 5.0
	}
	log.Printf("[HybridSearch] Tag hits: %d for tokens: %v", len(tagScores), expandedTags)

	// 5. 汇总所有笔记并计算最终评分
	allIDsMap := make(map[uint]bool)
	for id := range vectorScores {
		allIDsMap[id] = true
	}
	for id := range ftsScores {
		allIDsMap[id] = true
	}
	for id := range tagScores {
		allIDsMap[id] = true
	}

	var ids []uint
	for id := range allIDsMap {
		ids = append(ids, id)
	}

	if len(ids) == 0 {
		return []SearchResult{}, nil
	}

	var notes []models.NoteItem
	// 取消 is_archived 强过滤：只要明确搜到（关键词或标签匹配）就返回，保证召回率
	global.DB.Where("id IN ?", ids).Find(&notes)
	log.Printf("[HybridSearch] DB notes found: %d", len(notes))

	// 计算 Link Score (基于图连接度)
	linkCounts := make(map[uint]int)
	var links []struct {
		SourceID uint
		Count    int
	}
	global.DB.Table("note_links").Select("source_id, COUNT(*) as count").Where("source_id IN ?", ids).Group("source_id").Scan(&links)
	for _, l := range links {
		linkCounts[l.SourceID] = l.Count
	}

	// 计算被引用的次数
	var backlinkCounts []struct {
		Target string
		Count  int
	}
	global.DB.Table("note_links").Select("target, COUNT(*) as count").Where("target IN (SELECT original_name FROM note_items WHERE id IN ?)", ids).Group("target").Scan(&backlinkCounts)

	backlinkMap := make(map[string]int)
	for _, bl := range backlinkCounts {
		backlinkMap[bl.Target] = bl.Count
	}

	// 计算最终评分并构建结果集
	results := make([]SearchResult, 0)
	now := time.Now()
	for _, n := range notes {
		vs := vectorScores[n.ID]
		fs := ftsScores[n.ID]
		ts := tagScores[n.ID]

		// Recency Score: 越近的分数越高 (0-1)
		days := now.Sub(n.UpdatedAt).Hours() / 24
		rs := float32(0.0)
		if days < 365 {
			rs = float32(math.Max(0, 1.0-(days/365.0)))
		}

		// Link Score: 基于出链和入链 (归一化)
		ls := float32(linkCounts[n.ID]+backlinkMap[n.OriginalName]) / 10.0
		if ls > 1.0 {
			ls = 1.0
		}

		res := SearchResult{
			NoteItem:     n,
			VectorScore:  vs,
			FtsScore:     fs,
			TagScore:     ts,
			RecencyScore: rs,
			LinkScore:    ls,
		}
		// 综合重排权重：只要有任意一项得分 > 0，保底能排在后面展示
		res.Score = vs*0.4 + fs*0.2 + ts*0.1 + rs*0.1 + ls*0.2
		results = append(results, res)
	}

	// 排序
	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	return results, nil
}

// IntentDetection 优化版：短语优先 + 权重 + 多动词组合
func IntentDetection(query string) string {
	query = strings.ToLower(query)

	type keyword struct {
		word   string
		weight int
	}

	intentKeywords := map[string][]keyword{
		"search": {
			{"查找记录", 2}, {"搜索笔记", 2}, {"查询文档", 2},
			{"找", 1}, {"搜索", 1}, {"查询", 1}, {"查找", 1}, {"定位", 1}, {"获取", 1}, {"查看", 1}, {"检索", 1},
		},
		"summarize": {
			{"整理成表格", 2}, {"总结报告", 2},
			{"总结", 1}, {"归纳", 1}, {"概括", 1}, {"提炼", 1}, {"梳理", 1}, {"整理", 1}, {"精简", 1}, {"浓缩", 1}, {"概述", 1},
		},
		"explore": {
			{"分析关系", 2}, {"发现联系", 2},
			{"探索", 1}, {"发现", 1}, {"联系", 1}, {"延伸", 1}, {"拓展", 1}, {"挖掘", 1}, {"分析", 1}, {"研究", 1}, {"深挖", 1},
		},
		"generate": {
			{"生成报告", 2}, {"生成笔记", 2}, {"生成代码", 2},
			{"生成", 1}, {"创作", 1}, {"写", 1}, {"做", 1}, {"产出", 1}, {"创建", 1}, {"设计", 1}, {"构建", 1}, {"开发", 1},
		},
	}

	scores := make(map[string]int)
	used := make([]bool, len(query)) // 标记已匹配字符，避免重复计分

	for intent, kws := range intentKeywords {
		for _, kw := range kws {
			idx := strings.Index(query, kw.word)
			if idx >= 0 {
				overlap := false
				for i := idx; i < idx+len(kw.word) && i < len(used); i++ {
					if used[i] {
						overlap = true
						break
					}
				}
				if !overlap {
					// 标记已使用
					for i := idx; i < idx+len(kw.word) && i < len(used); i++ {
						used[i] = true
					}
					scores[intent] += kw.weight
				}
			}
		}
	}

	// 选择得分最高的意图
	bestIntent := "search"
	maxScore := 0
	for intent, score := range scores {
		if score > maxScore {
			bestIntent = intent
			maxScore = score
		}
	}

	return bestIntent
}

// QueryRewrite 扩展查询意图
func QueryRewrite(query string) []string {
	// 1. 同义词库扩展 (基于分词和 FTS 同义词表)
	synonyms := synonym.RewriteQuery(query)
	log.Printf("[QueryRewrite] Final: %s -> %v", query, synonyms)

	// 去重并限制数量
	return uniqueStrings(synonyms)
}

func uniqueStrings(slice []string) []string {
	keys := make(map[string]bool)
	list := []string{}
	for _, entry := range slice {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if _, value := keys[entry]; !value {
			keys[entry] = true
			list = append(list, entry)
		}
	}
	if len(list) > 6 {
		list = list[:6]
	}
	return list
}

// BuildRAGContext 构建 RAG 上下文
func BuildRAGContext(results []SearchResult) string {
	if len(results) == 0 {
		return ""
	}

	var sb strings.Builder
	// 按 ID 去重并按分数排序已在 HybridSearch 完成
	// 这里可以考虑按主题分组（通过标签）

	for i, res := range results {
		sb.WriteString(fmt.Sprintf("[%d] 标题: %s\n摘要: %s\n内容: %s\n\n",
			i+1, res.OriginalName, res.AiSummary, res.OcrText))

		// 简单的长度控制，防止撑爆 Context (限制在 8000 token 左右)
		if sb.Len() > 20000 {
			break
		}
	}

	return sb.String()
}

// RAGAsk 执行完整的 RAG 问答流程
func RAGAsk(query string) (string, []SearchResult, string, error) {
	// 1. 意图检测
	intent := IntentDetection(query)
	log.Printf("[RAG] Detected intent: %s", intent)

	// 2. 查询改写与检索
	uniqueResults := make(map[uint]SearchResult)

	// 首先执行一次改写获取所有扩展词 (包括同义词)
	expandedQueries := []string{query}
	if intent == "search" || intent == "explore" {
		expandedQueries = QueryRewrite(query) // 返回值已包含原始 query
	}

	for _, q := range expandedQueries {
		// 增加单次检索上限，提高召回率
		hits, _ := HybridSearch(q, 10)
		for _, h := range hits {
			if existing, ok := uniqueResults[h.ID]; !ok || h.Score > existing.Score {
				uniqueResults[h.ID] = h
			}
		}
	}
	log.Printf("[RAG] Unique hits gathered: %d", len(uniqueResults))

	// 4. 图谱扩展 (针对 top 结果拉取关联项)
	allHits := make([]SearchResult, 0, len(uniqueResults))
	for _, h := range uniqueResults {
		allHits = append(allHits, h)
	}
	sort.Slice(allHits, func(i, j int) bool { return allHits[i].Score > allHits[j].Score })

	if len(allHits) > 10 {
		allHits = allHits[:10]
	}

	// Graph Expansion: 对 Top 3 的关联项进行补充
	log.Printf("[RAG] Proceeding with %d unique hits from retrieval", len(uniqueResults))
	for i := 0; i < 3 && i < len(allHits); i++ {
		related, _ := GetRelatedNotes(allHits[i].ID)
		if len(related) > 0 {
			log.Printf("[RAG] Graph expand from #%d (%s): found %d related notes", i+1, allHits[i].OriginalName, len(related))
		}
		for _, rn := range related {
			if _, ok := uniqueResults[rn.ID]; !ok {
				// 幽灵评分，保证其在上下文末尾
				uniqueResults[rn.ID] = SearchResult{NoteItem: rn, Score: 0.1, LinkScore: 1.0}
			}
		}
	}

	// 重新整理结果
	finalHits := make([]SearchResult, 0, len(uniqueResults))
	for _, h := range uniqueResults {
		finalHits = append(finalHits, h)
	}
	sort.Slice(finalHits, func(i, j int) bool { return finalHits[i].Score > finalHits[j].Score })

	log.Printf("[RAG] Final context hits: %d", len(finalHits))

	// 5. 构建上下文并问答
	context := BuildRAGContext(finalHits)
	log.Printf("[AskAI] Context length: %d\n", len(context))

	systemPrompt := "你是一个专注于个人知识库的智能助手，同时具备深厚的通用知识储备。你会优先基于【参考笔记上下文】来回答用户的问题，以体现出你对用户个人资料的了解；如果数据中没有直接答案，请结合由于你作为大模型本身的通用智慧来流畅地回答，无需由于缺乏引用而反复道歉。请用简洁、深刻的口吻进行回复，并支持 Markdown 格式排版。\n\n"
	if context != "" {
		systemPrompt += "【参考笔记上下文】开始：\n" + context + "\n【参考笔记上下文】结束"
	} else {
		systemPrompt += "（当前没有找到与问题直接相关的笔记碎片记录）"
	}

	answer, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": query},
	}, systemPrompt)

	return answer, finalHits, intent, err
}
