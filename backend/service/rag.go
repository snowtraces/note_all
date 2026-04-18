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

// SearchResult 混合检索结果项
type SearchResult struct {
	models.NoteItem
	Score        float32 `json:"score"`
	VectorScore  float32 `json:"vector_score"`
	FtsScore     float32 `json:"fts_score"`
	TagScore     float32 `json:"tag_score"`
	RecencyScore float32 `json:"recency_score"`
}

// UpdateNoteEmbedding 生成或更新笔记的向量索引
func UpdateNoteEmbedding(nID uint) error {
	var note models.NoteItem
	if err := global.DB.First(&note, nID).Error; err != nil {
		return err
	}

	content := fmt.Sprintf("%s\n%s", note.AiSummary, note.OcrText)
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(content)))

	var existing models.NoteEmbedding
	found := global.DB.Where("note_id = ?", nID).First(&existing).Error == nil
	if found && existing.Hash == hash {
		return nil
	}

	vec, err := pkg.GetEmbedding(content)
	if err != nil {
		return fmt.Errorf("failed to get embedding: %v", err)
	}

	blob, err := models.Float32ToBytes(vec)
	if err != nil {
		return err
	}

	if found {
		existing.Embedding = blob
		existing.Hash = hash
		return global.DB.Save(&existing).Error
	}

	return global.DB.Create(&models.NoteEmbedding{
		NoteID:    nID,
		Embedding: blob,
		Hash:      hash,
	}).Error
}

// BackfillNoteEmbeddings 补全历史笔记的向量索引
func BackfillNoteEmbeddings() error {
	var notes []models.NoteItem
	err := global.DB.Where("status IN ? AND deleted_at IS NULL AND id NOT IN (SELECT note_id FROM note_embeddings)", []string{"analyzed", "done"}).Find(&notes).Error
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
		time.Sleep(100 * time.Millisecond)
	}
	return nil
}

// HybridSearch 单关键词混合检索
func HybridSearch(query string, limit int) ([]SearchResult, error) {
	return BatchHybridSearch([]string{query}, limit)
}

// BatchHybridSearch 批量混合检索，合并多关键词查询
func BatchHybridSearch(queries []string, limit int) ([]SearchResult, error) {
	// 1. 向量检索 (只对第一个 query)
	vectorScores := make(map[uint]float32)
	if len(queries) > 0 {
		queryVec, err := pkg.GetEmbedding(queries[0])
		if err != nil {
			log.Printf("[BatchHybridSearch] GetEmbedding failed: %v", err)
		} else if queryVec != nil {
			if global.VectorExtLoaded {
				queryBlob, _ := models.Float32ToBytes(queryVec)
				var vecResults []struct {
					NoteID   uint    `gorm:"column:note_id"`
					Distance float32 `gorm:"column:distance"`
				}
				global.DB.Raw(`
					SELECT ne.note_id, v.distance
					FROM vector_full_scan('note_embeddings', 'embedding', ?, 50) AS v
					JOIN note_embeddings AS ne ON ne.id = v.rowid
					JOIN note_items AS n ON n.id = ne.note_id
					WHERE n.deleted_at IS NULL AND n.status IN ('analyzed', 'done')
				`, queryBlob).Scan(&vecResults)
				for _, r := range vecResults {
					score := float32(1.0 - float64(r.Distance)/2.0)
					if score > 0.73 {
						vectorScores[r.NoteID] = score
					}
				}
				log.Printf("[BatchHybridSearch] Vector hits: %d (sqlite-vector)", len(vectorScores))
			} else {
				var embeddings []models.NoteEmbedding
				global.DB.Find(&embeddings)
				for _, e := range embeddings {
					vec, err := models.BytesToFloat32(e.Embedding)
					if err == nil {
						score := models.CosineSimilarity(queryVec, vec)
						if score > 0.73 {
							vectorScores[e.NoteID] = score
						}
					}
				}
				log.Printf("[BatchHybridSearch] Vector hits: %d (fallback)", len(vectorScores))
			}
		}
	}

	// 2. FTS5 全文搜索 (合并所有 queries)
	ftsScores := make(map[uint]float32)
	ftsQueries := make([]string, 0, len(queries))
	for _, q := range queries {
		ftsQueries = append(ftsQueries, "\""+strings.ReplaceAll(q, "\"", "")+"\"")
	}
	ftsQuery := strings.Join(ftsQueries, " OR ")
	var ftsResults []struct {
		ID    uint
		Score float32
	}
	global.DB.Raw("SELECT rowid as id, -bm25(note_fts) as score FROM note_fts WHERE note_fts MATCH ? ORDER BY score DESC LIMIT 50", ftsQuery).Scan(&ftsResults)
	for _, r := range ftsResults {
		if existing, ok := ftsScores[r.ID]; !ok || r.Score > existing {
			ftsScores[r.ID] = r.Score
		}
	}
	log.Printf("[BatchHybridSearch] FTS5 hits: %d", len(ftsScores))

	// 3. Tag 检索 (合并所有 queries 的扩展词)
	allTags := make([]string, 0)
	for _, q := range queries {
		allTags = append(allTags, synonym.RewriteQuery(q)...)
	}
	allTags = uniqueStrings(allTags)
	var tagHits []struct {
		NoteID uint
		Count  int
	}
	global.DB.Table("note_tags").
		Select("note_id, COUNT(*) as count").
		Where("tag IN ?", allTags).
		Joins("JOIN note_items ON note_items.id = note_tags.note_id").
		Where("note_items.deleted_at IS NULL AND note_items.status IN ? AND note_items.is_archived = ?", []string{"analyzed", "done"}, false).
		Group("note_id").Scan(&tagHits)
	tagScores := make(map[uint]float32)
	for _, r := range tagHits {
		tagScores[r.NoteID] = float32(r.Count) * 5.0
	}
	log.Printf("[BatchHybridSearch] Tag hits: %d for tags: %v", len(tagScores), allTags)

	// 4. 合并所有 ID
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

	// 5. 获取笔记详情
	var notes []models.NoteItem
	global.DB.Where("id IN ? AND deleted_at IS NULL", ids).Find(&notes)
	log.Printf("[BatchHybridSearch] Notes found: %d", len(notes))

	// 6. 计算评分
	results := make([]SearchResult, 0)
	now := time.Now()
	for _, n := range notes {
		vs := vectorScores[n.ID]
		fs := ftsScores[n.ID]
		ts := tagScores[n.ID]

		days := now.Sub(n.UpdatedAt).Hours() / 24
		rs := float32(0.0)
		if days < 365 {
			rs = float32(math.Max(0, 1.0-(days/365.0)))
		}

		// 动态权重：纯 Tag 命中时提高 TagScore 权重
		vsWeight, fsWeight, tsWeight, rsWeight := float32(0.5), float32(0.25), float32(0.15), float32(0.1)
		if vs == 0 && fs == 0 && ts > 0 {
			vsWeight, fsWeight, tsWeight, rsWeight = 0.0, 0.0, 0.8, 0.2
		}

		res := SearchResult{
			NoteItem:     n,
			VectorScore:  vs,
			FtsScore:     fs,
			TagScore:     ts,
			RecencyScore: rs,
		}
		res.Score = vs*vsWeight + fs*fsWeight + ts*tsWeight + rs*rsWeight
		results = append(results, res)
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	if len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

// IntentDetection 意图检测
func IntentDetection(query string) string {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return "record"
	}

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
	used := make([]bool, len(query))

	for intent, kws := range intentKeywords {
		for _, kw := range kws {
			if strings.HasPrefix(query, kw.word) {
				overlap := false
				start := 0
				end := len(kw.word)
				if end > len(used) {
					end = len(used)
				}
				for i := start; i < end; i++ {
					if used[i] {
						overlap = true
						break
					}
				}
				if !overlap {
					for i := start; i < end; i++ {
						used[i] = true
					}
					scores[intent] += kw.weight
				}
			}
		}
	}

	bestIntent := ""
	maxScore := 0
	for intent, score := range scores {
		if score > maxScore {
			bestIntent = intent
			maxScore = score
		}
	}
	if bestIntent != "" {
		return bestIntent
	}

	qMarkers := []string{"?", "？", "如何", "什么是", "怎么", "为什么", "谁", "哪里", "哪个", "是否", "吗"}
	for _, m := range qMarkers {
		if strings.Contains(query, m) {
			return "search"
		}
	}

	return "record"
}

// QueryRewrite 扩展查询意图
func QueryRewrite(query string) []string {
	synonyms := synonym.RewriteQuery(query)
	log.Printf("[QueryRewrite] Final: %s -> %v", query, synonyms)
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
	for i, res := range results {
		sb.WriteString(fmt.Sprintf("[%d] 标题: %s\n摘要: %s\n内容: %s\n\n",
			i+1, res.OriginalName, res.AiSummary, res.OcrText))
		if sb.Len() > 20000 {
			break
		}
	}
	return sb.String()
}

// RAGAsk 执行完整的 RAG 问答流程
func RAGAsk(query string) (string, []SearchResult, string, error) {
	intent := IntentDetection(query)
	log.Printf("[RAG] Detected intent: %s", intent)

	expandedQueries := []string{query}
	if intent == "search" || intent == "explore" {
		expandedQueries = QueryRewrite(query)
	}

	// 使用 BatchHybridSearch 合并所有扩展词
	hits, err := BatchHybridSearch(expandedQueries, 20)
	if err != nil {
		log.Printf("[RAG] BatchHybridSearch failed: %v", err)
	}

	uniqueResults := make(map[uint]SearchResult)
	for _, h := range hits {
		uniqueResults[h.ID] = h
	}
	log.Printf("[RAG] Initial hits: %d", len(uniqueResults))

	// 图谱扩展
	allHits := make([]SearchResult, 0, len(uniqueResults))
	for _, h := range uniqueResults {
		allHits = append(allHits, h)
	}
	sort.Slice(allHits, func(i, j int) bool { return allHits[i].Score > allHits[j].Score })

	if len(allHits) > 10 {
		allHits = allHits[:10]
	}

	log.Printf("[RAG] Proceeding with %d hits", len(allHits))
	for i := 0; i < 3 && i < len(allHits); i++ {
		related, _ := GetRelatedNotes(allHits[i].ID)
		if len(related) > 0 {
			log.Printf("[RAG] Graph expand from #%d (%s): found %d related", i+1, allHits[i].OriginalName, len(related))
		}
		for _, rn := range related {
			if _, ok := uniqueResults[rn.ID]; !ok {
				uniqueResults[rn.ID] = SearchResult{NoteItem: rn, Score: 0.1}
			}
		}
	}

	finalHits := make([]SearchResult, 0, len(uniqueResults))
	for _, h := range uniqueResults {
		finalHits = append(finalHits, h)
	}
	sort.Slice(finalHits, func(i, j int) bool { return finalHits[i].Score > finalHits[j].Score })

	log.Printf("[RAG] Final context hits: %d", len(finalHits))

	context := BuildRAGContext(finalHits)
	log.Printf("[AskAI] Context length: %d", len(context))

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
