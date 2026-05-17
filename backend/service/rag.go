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
	"note_all_backend/pkg/chunker"
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

// ChunkSearchResult 分片检索结果
type ChunkSearchResult struct {
	ChunkID    uint
	NoteID     uint
	Content    string
	Heading    string
	ChunkIndex int
	Score      float32
}

// UpdateNoteChunks 生成或更新笔记的分片向量索引
func UpdateNoteChunks(nID uint) error {
	var note models.NoteItem
	if err := global.DB.First(&note, nID).Error; err != nil {
		return err
	}

	// 获取分片配置
	config := models.GetChunkConfig()

	// 对文档进行分片
	chunks := chunker.ChunkText(note.OcrText, config)
	if len(chunks) == 0 {
		return nil
	}

	// 批量删除旧的分片记录（先查询ID再删除，避免子查询性能问题）
	var oldChunkIDs []uint
	global.DB.Model(&models.NoteChunk{}).Where("note_id = ?", nID).Pluck("id", &oldChunkIDs)
	if len(oldChunkIDs) > 0 {
		global.DB.Where("chunk_id IN ?", oldChunkIDs).Delete(&models.NoteChunkEmbedding{})
		global.DB.Where("id IN ?", oldChunkIDs).Delete(&models.NoteChunk{})
	}

	// 创建新分片并生成向量
	for i, chunk := range chunks {
		// 保存分片记录
		nc := models.NoteChunk{
			NoteID:     nID,
			ChunkIndex: i,
			Content:    chunk.Content,
			StartPos:   chunk.StartPos,
			EndPos:     chunk.EndPos,
			Heading:    chunk.Heading,
			ChunkType:  chunk.ChunkType,
		}
		if err := global.DB.Create(&nc).Error; err != nil {
			log.Printf("[UpdateNoteChunks] 创建分片失败 (ID:%d, index:%d): %v", nID, i, err)
			continue
		}

		// 生成分片向量
		vec, err := pkg.GetEmbedding(chunk.Content)
		if err != nil {
			log.Printf("[UpdateNoteChunks] 获取向量失败 (chunk_id:%d): %v", nc.ID, err)
			continue
		}

		blob, err := models.Float32ToBytes(vec)
		if err != nil {
			log.Printf("[UpdateNoteChunks] 向量编码失败 (chunk_id:%d): %v", nc.ID, err)
			continue
		}

		hash := fmt.Sprintf("%x", sha256.Sum256([]byte(chunk.Content)))
		if err := global.DB.Create(&models.NoteChunkEmbedding{
			ChunkID:   nc.ID,
			Embedding: blob,
			Hash:      hash,
		}).Error; err != nil {
			log.Printf("[UpdateNoteChunks] 保存向量失败 (chunk_id:%d): %v", nc.ID, err)
		}
	}

	log.Printf("[UpdateNoteChunks] 完成 (ID:%d): 生成 %d 个分片", nID, len(chunks))
	return nil
}

// BackfillNoteChunks 补全历史笔记的分片向量索引
func BackfillNoteChunks() error {
	var notes []models.NoteItem
	err := global.DB.Where("status IN ? AND deleted_at IS NULL AND ocr_text != '' AND ocr_text IS NOT NULL",
		[]string{"analyzed", "done"}).
		Where("id NOT IN (SELECT DISTINCT note_id FROM note_chunks)").
		Find(&notes).Error
	if err != nil {
		return err
	}

	if len(notes) == 0 {
		log.Printf("[BackfillNoteChunks] 无需补全，所有笔记已有分片索引")
		return nil
	}

	log.Printf("[BackfillNoteChunks] 发现 %d 条笔记需要补全分片索引...", len(notes))
	for _, n := range notes {
		if err := UpdateNoteChunks(n.ID); err != nil {
			log.Printf("[BackfillNoteChunks] 补全失败 (ID:%d): %v", n.ID, err)
		} else {
			log.Printf("[BackfillNoteChunks] 补全成功 (ID:%d)", n.ID)
		}
		time.Sleep(100 * time.Millisecond)
	}
	return nil
}

// HybridSearch 单关键词混合检索
func HybridSearch(query string, limit int, folderFilter string) ([]SearchResult, error) {
	return BatchHybridSearch([]string{query}, limit, folderFilter)
}

// BatchHybridSearch 批量混合检索，合并多关键词查询
func BatchHybridSearch(queries []string, limit int, folderFilter string) ([]SearchResult, error) {
	// 1. 分片级向量检索 (只对第一个 query)
	vectorScores := make(map[uint]float32)
	if len(queries) > 0 {
		queryVec, err := pkg.GetEmbedding(queries[0])
		if err != nil {
			log.Printf("[BatchHybridSearch] GetEmbedding failed: %v", err)
		} else if queryVec != nil {
			if global.VectorExtLoaded {
				queryBlob, _ := models.Float32ToBytes(queryVec)
				var vecResults []struct {
					ChunkID    uint    `gorm:"column:chunk_id"`
					NoteID     uint    `gorm:"column:note_id"`
					Content    string  `gorm:"column:content"`
					Heading    string  `gorm:"column:heading"`
					ChunkIndex int     `gorm:"column:chunk_index"`
					Distance   float32 `gorm:"column:distance"`
				}
				// 使用分片向量表进行检索
				global.DB.Raw(`
					SELECT nc.id as chunk_id, nc.note_id, nc.content, nc.heading, nc.chunk_index, v.distance
					FROM vector_full_scan('note_chunk_embeddings', 'embedding', ?, 50) AS v
					JOIN note_chunk_embeddings AS ce ON ce.id = v.rowid
					JOIN note_chunks AS nc ON nc.id = ce.chunk_id
					JOIN note_items AS n ON n.id = nc.note_id
					WHERE n.deleted_at IS NULL AND n.status IN ('analyzed', 'done') AND n.is_archived = 0
					ORDER BY v.distance ASC
				`, queryBlob).Scan(&vecResults)
				// 聚合分片分数到文档级（取最高分）
				for _, r := range vecResults {
					score := float32(1.0 - float64(r.Distance)/2.0)
					if score > 0.78 {
						// 文档分数取所有分片中的最高分
						if existing, ok := vectorScores[r.NoteID]; !ok || score > existing {
							vectorScores[r.NoteID] = score
						}
					}
				}
			} else {
				// sqlite-vector 未加载，跳过向量检索，仅使用 FTS5 + Tag
			}
		}
	}

	// 2. FTS5 全文搜索 (合并所有 queries，排除 #开头的标签查询)
	ftsScores := make(map[uint]float32)
	ftsQueries := make([]string, 0, len(queries))
	for _, q := range queries {
		if strings.HasPrefix(q, "#") {
			continue // 标签查询不参与 FTS 搜索
		}
		ftsQueries = append(ftsQueries, strings.ReplaceAll(q, "\"", ""))
	}
	if len(ftsQueries) > 0 {
		// 使用 Jieba 分词辅助搜索，提高匹配度
		jieba := synonym.GetJieba()
		allFtsTerms := make([]string, 0)

		// 常用干扰词过滤（停用词）
		stopWords := map[string]bool{
			"查找": true, "一下": true, "最近": true, "搜索": true, "查询": true,
			"获取": true, "展示": true, "看看": true, "关于": true, "那个": true,
			"哪些": true, "什么": true, "如何": true, "怎么": true, "的": true,
			"了": true, "在": true, "是": true, "我": true, "你": true,
		}

		for _, q := range ftsQueries {
			// 原词匹配（带引号，精确匹配）
			allFtsTerms = append(allFtsTerms, "\""+q+"\"")

			if jieba != nil {
				// 提取核心词（去除停用词和过短词）
				segments := jieba.Cut(q, true)
				for _, seg := range segments {
					seg = strings.TrimSpace(seg)
					if len([]rune(seg)) < 2 || stopWords[seg] {
						continue
					}
					allFtsTerms = append(allFtsTerms, "\""+seg+"\"")
				}
			}
		}

		// 如果分词后没有有效词，保留原词
		if len(allFtsTerms) == 0 {
			for _, q := range ftsQueries {
				allFtsTerms = append(allFtsTerms, "\""+q+"\"")
			}
		}

		allFtsTerms = uniqueStrings(allFtsTerms)
		ftsQuery := strings.Join(allFtsTerms, " OR ")

		log.Printf("[RAG] FTS Query: %s", ftsQuery)

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
	}

	// 3. Tag 检索 (合并所有 queries 的扩展词)
	allTags := make([]string, 0)
	for _, q := range queries {
		if tag, ok := strings.CutPrefix(q, "#"); ok {
			// #开头的精确匹配，不展开同义词
			allTags = append(allTags, tag)
		} else {
			allTags = append(allTags, synonym.RewriteQuery(q)...)
		}
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
	dbQuery := global.DB.Where("id IN ? AND deleted_at IS NULL AND is_archived = ?", ids, false)

	if folderFilter != "" {
		parts := strings.SplitN(folderFilter, "/", 2)
		dbQuery = dbQuery.Where("folder_l1 = ?", parts[0])
		if len(parts) > 1 {
			dbQuery = dbQuery.Where("folder_l2 = ?", parts[1])
		}
	}
	dbQuery.Find(&notes)

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

// BuildRAGContext 构建 RAG 上下文（使用完整文档）
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

// BuildRAGContextFromChunks 从分片构建 RAG 上下文（智能选择相关片段）
func BuildRAGContextFromChunks(results []SearchResult, hitChunks map[uint][]ChunkSearchResult) string {
	if len(results) == 0 {
		return ""
	}

	// 1. 收集所有需要查询的索引范围
	expandRanges := make(map[uint][2]int) // noteID -> [expandStart, expandEnd]
	for _, res := range results {
		chunks := hitChunks[res.ID]
		if len(chunks) == 0 {
			continue
		}
		minIndex := chunks[0].ChunkIndex
		maxIndex := chunks[0].ChunkIndex
		for _, c := range chunks {
			if c.ChunkIndex < minIndex {
				minIndex = c.ChunkIndex
			}
			if c.ChunkIndex > maxIndex {
				maxIndex = c.ChunkIndex
			}
		}
		// 扩展前后各1片
		expandStart := minIndex - 1
		if expandStart < 0 {
			expandStart = 0
		}
		expandEnd := maxIndex + 2
		expandRanges[res.ID] = [2]int{expandStart, expandEnd}
	}

	// 2. 批量查询所有相关分片（解决 N+1 问题）
	var allChunks []models.NoteChunk
	if len(expandRanges) > 0 {
		noteIDs := make([]uint, 0, len(expandRanges))
		for id := range expandRanges {
			noteIDs = append(noteIDs, id)
		}
		global.DB.Where("note_id IN ?", noteIDs).
			Order("note_id, chunk_index ASC").
			Find(&allChunks)
	}

	// 3. 按 noteID 分组
	chunksByNote := make(map[uint][]models.NoteChunk)
	for _, c := range allChunks {
		chunksByNote[c.NoteID] = append(chunksByNote[c.NoteID], c)
	}

	// 4. 构建上下文
	var sb strings.Builder
	for i, res := range results {
		sb.WriteString(fmt.Sprintf("[%d] 文档: %s\n摘要: %s\n", i+1, res.OriginalName, res.AiSummary))

		// 获取该文档命中的分片（最多5个）
		hit := hitChunks[res.ID]
		if len(hit) > 0 {
			// 从批量查询结果中筛选并扩展
			expandedChunks := selectExpandChunks(res.ID, hit, chunksByNote[res.ID], expandRanges[res.ID], 5)
			for _, chunk := range expandedChunks {
				sb.WriteString(fmt.Sprintf("> 相关片段:\n%s\n\n", chunk.Content))
			}
		} else {
			// 没有分片命中时，使用原文（截断）
			text := res.OcrText
			if len([]rune(text)) > 1000 {
				text = string([]rune(text)[:1000]) + "..."
			}
			sb.WriteString(fmt.Sprintf("> 内容摘要:\n%s\n\n", text))
		}
		sb.WriteString("---\n")

		contextLimit := global.Config.RagContextLimit
		if contextLimit <= 0 {
			contextLimit = 12000
		}
		if sb.Len() > contextLimit {
			break
		}
	}
	return sb.String()
}

// selectExpandChunks 从批量查询结果中选择扩展分片，最多返回 maxChunks 个
func selectExpandChunks(noteID uint, hitChunks []ChunkSearchResult, allChunks []models.NoteChunk, expandRange [2]int, maxChunks int) []ChunkSearchResult {
	if len(hitChunks) == 0 || len(allChunks) == 0 {
		return nil
	}

	// 筛选扩展范围内的分片
	expandStart, expandEnd := expandRange[0], expandRange[1]
	result := make([]ChunkSearchResult, 0)
	for _, c := range allChunks {
		if c.ChunkIndex < expandStart || c.ChunkIndex >= expandEnd {
			continue
		}
		hitScore := float32(0)
		for _, h := range hitChunks {
			if h.ChunkID == c.ID {
				hitScore = h.Score
				break
			}
		}
		result = append(result, ChunkSearchResult{
			ChunkID:    c.ID,
			NoteID:     c.NoteID,
			Content:    c.Content,
			Heading:    c.Heading,
			ChunkIndex: c.ChunkIndex,
			Score:      hitScore,
		})
	}

	// 限制最多返回 maxChunks 个分片（优先保留命中的分片）
	if len(result) > maxChunks {
		sort.Slice(result, func(i, j int) bool {
			return result[i].Score > result[j].Score || (result[i].Score == result[j].Score && result[i].ChunkIndex < result[j].ChunkIndex)
		})
		result = result[:maxChunks]
		sort.Slice(result, func(i, j int) bool {
			return result[i].ChunkIndex < result[j].ChunkIndex
		})
	}

	return result
}

// RAGAsk 执行完整的 RAG 问答流程
func RAGAsk(query string) (string, []SearchResult, string, error) {
	return RAGAskWithHistory(query, nil)
}

// RAGAskWithHistory 执行带历史对话的 RAG 问答流程
func RAGAskWithHistory(query string, history []ConversationMessage) (string, []SearchResult, string, error) {
	// 使用统一的 IntentAnalyzer
	analyzer := NewIntentAnalyzer()
	intentResult := analyzer.Analyze(query, history, &SessionContext{})
	intent := string(intentResult.Type)

	expandedQueries := []string{query}
	if intentResult.Type == IntentSearch || intentResult.Type == IntentCompare {
		expandedQueries = QueryRewrite(query)
	}

	// 使用分片级混合检索 (限制为 4 个引证)
	hits, hitChunks, err := BatchHybridSearchWithChunks(expandedQueries, 4, "")
	if err != nil {
		log.Printf("[RAG] [错误] 检索失败: %v", err)
	}

	uniqueResults := make(map[uint]SearchResult)
	for _, h := range hits {
		uniqueResults[h.ID] = h
	}

	// 图谱扩展
	allHits := make([]SearchResult, 0, len(uniqueResults))
	for _, h := range uniqueResults {
		allHits = append(allHits, h)
	}
	sort.Slice(allHits, func(i, j int) bool { return allHits[i].Score > allHits[j].Score })

	if len(allHits) > 10 {
		allHits = allHits[:10]
	}

	for i := 0; i < 3 && i < len(allHits); i++ {
		related, _ := GetRelatedNotes(allHits[i].ID)
		if len(related) > 0 {
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

	// 使用分片上下文构建（如果有分片命中）
	var context string
	if len(hitChunks) > 0 {
		context = BuildRAGContextFromChunks(finalHits, hitChunks)
	} else {
		context = BuildRAGContext(finalHits)
	}

	systemPrompt := "你是一个专注于个人知识库的智能助手，同时具备深厚的通用知识储备。你会优先基于【参考笔记上下文】来回答用户的问题，以体现出你对用户个人资料的了解；如果数据中没有直接答案，请结合由于你作为大模型本身的通用智慧来流畅地回答，无需由于缺乏引用而反复道歉。请用简洁、深刻的口吻进行回复，并支持 Markdown 格式排版。\n\n"
	if context != "" {
		systemPrompt += "【参考笔记上下文】开始：\n" + context + "\n【参考笔记上下文】结束"
	} else {
		systemPrompt += "（当前没有找到与问题直接相关的笔记碎片记录）"
	}

	// 构建消息列表：先加入历史对话，最后加入当前问题
	messages := make([]map[string]string, 0)
	for _, msg := range history {
		if msg.Role == "user" || msg.Role == "assistant" {
			messages = append(messages, map[string]string{
				"role":    msg.Role,
				"content": msg.Content,
			})
		}
	}
	// 添加当前问题
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": query,
	})

	answer, err := pkg.AskAI(messages, systemPrompt)

	return answer, finalHits, intent, err
}

// BatchHybridSearchWithChunks 分片级混合检索，返回文档结果和命中的分片
func BatchHybridSearchWithChunks(queries []string, limit int, folderFilter string) ([]SearchResult, map[uint][]ChunkSearchResult, error) {
	// 1. 分片级向量检索
	vectorScores := make(map[uint]float32)
	hitChunks := make(map[uint][]ChunkSearchResult)
	if len(queries) > 0 {
		queryVec, err := pkg.GetEmbedding(queries[0])
		if err != nil {
			log.Printf("[BatchHybridSearchWithChunks] GetEmbedding failed: %v", err)
		} else if queryVec != nil {
			if global.VectorExtLoaded {
				queryBlob, _ := models.Float32ToBytes(queryVec)
				var vecResults []struct {
					ChunkID    uint    `gorm:"column:chunk_id"`
					NoteID     uint    `gorm:"column:note_id"`
					Content    string  `gorm:"column:content"`
					Heading    string  `gorm:"column:heading"`
					ChunkIndex int     `gorm:"column:chunk_index"`
					Distance   float32 `gorm:"column:distance"`
				}
				global.DB.Raw(`
					SELECT nc.id as chunk_id, nc.note_id, nc.content, nc.heading, nc.chunk_index, v.distance
					FROM vector_full_scan('note_chunk_embeddings', 'embedding', ?, 50) AS v
					JOIN note_chunk_embeddings AS ce ON ce.id = v.rowid
					JOIN note_chunks AS nc ON nc.id = ce.chunk_id
					JOIN note_items AS n ON n.id = nc.note_id
					WHERE n.deleted_at IS NULL AND n.status IN ('analyzed', 'done') AND n.is_archived = 0
					ORDER BY v.distance ASC
				`, queryBlob).Scan(&vecResults)
				for _, r := range vecResults {
					score := float32(1.0 - float64(r.Distance)/2.0)
					if score > 0.78 {
						hitChunks[r.NoteID] = append(hitChunks[r.NoteID], ChunkSearchResult{
							ChunkID:    r.ChunkID,
							NoteID:     r.NoteID,
							Content:    r.Content,
							Heading:    r.Heading,
							ChunkIndex: r.ChunkIndex,
							Score:      score,
						})
						if existing, ok := vectorScores[r.NoteID]; !ok || score > existing {
							vectorScores[r.NoteID] = score
						}
					}
				}
			} else {
				// sqlite-vector 未加载，跳过向量检索，仅使用 FTS5 + Tag
			}
		}
	}

	// 2. FTS5 全文搜索 (排除 #开头的标签查询)
	ftsScores := make(map[uint]float32)
	ftsQueries := make([]string, 0, len(queries))
	for _, q := range queries {
		if strings.HasPrefix(q, "#") {
			continue // 标签查询不参与 FTS 搜索
		}
		ftsQueries = append(ftsQueries, strings.ReplaceAll(q, "\"", ""))
	}
	if len(ftsQueries) > 0 {
		jieba := synonym.GetJieba()
		allFtsTerms := make([]string, 0)
		// 常用干扰词过滤（停用词）
		stopWords := map[string]bool{
			"查找": true, "一下": true, "最近": true, "搜索": true, "查询": true,
			"获取": true, "展示": true, "看看": true, "关于": true, "那个": true,
			"哪些": true, "什么": true, "如何": true, "怎么": true, "的": true,
			"了": true, "在": true, "是": true, "我": true, "你": true,
		}

		for _, q := range ftsQueries {
			// 原词匹配
			allFtsTerms = append(allFtsTerms, "\""+q+"\"")
			if jieba != nil {
				segments := jieba.Cut(q, true)
				for _, seg := range segments {
					seg = strings.TrimSpace(seg)
					if len([]rune(seg)) < 2 || stopWords[seg] {
						continue
					}
					allFtsTerms = append(allFtsTerms, "\""+seg+"\"")
				}
			}
		}
		allFtsTerms = uniqueStrings(allFtsTerms)
		ftsQuery := strings.Join(allFtsTerms, " OR ")
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
	}

	// 3. Tag 检索
	allTags := make([]string, 0)
	for _, q := range queries {
		if tag, ok := strings.CutPrefix(q, "#"); ok {
			// #开头的精确匹配，不展开同义词
			allTags = append(allTags, tag)
		} else {
			allTags = append(allTags, synonym.RewriteQuery(q)...)
		}
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
		return []SearchResult{}, hitChunks, nil
	}

	// 5. 获取笔记详情
	var notes []models.NoteItem
	dbQuery := global.DB.Where("id IN ? AND deleted_at IS NULL AND is_archived = ?", ids, false)

	if folderFilter != "" {
		parts := strings.SplitN(folderFilter, "/", 2)
		dbQuery = dbQuery.Where("folder_l1 = ?", parts[0])
		if len(parts) > 1 {
			dbQuery = dbQuery.Where("folder_l2 = ?", parts[1])
		}
	}
	dbQuery.Find(&notes)

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

	return results, hitChunks, nil
}
