package chunker

import (
	"regexp"
	"strings"

	"note_all_backend/models"
)

// 常量定义
const (
	// 分隔符长度（"\n\n" 两个换行符）
	separatorLen = 2
	// 拆分有效性阈值：如果拆分后只有一个分片且内容仅减少此值以内，视为无效拆分
	splitValidThreshold = 50
	// 段落分隔最小换行数
	paragraphSeparatorNewlines = 2
)

// ChunkResult 分片结果
type ChunkResult struct {
	Content   string
	RuneLen   int    // 缓存 rune 长度，避免重复 []rune() 转换
	StartPos  int
	EndPos    int
	Heading   string
	ChunkType string
}

// 标题识别正则模式（分层递进拆分策略）
var (
	// H2 章节标题（顶层分割）
	h2Pattern = regexp.MustCompile(`(?m)^#{2}\s+[^\s].+$`)
	// H3 小节标题（二级分割）
	h3Pattern = regexp.MustCompile(`(?m)^#{3}\s+[^\s].+$`)
	// 其他标题格式（三级分割）
	otherHeadingPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?m)^第[一二三四五六七八九十百千万\d]+[章节部篇].*$`),  // 中文章节：第X章/节/部/篇
		regexp.MustCompile(`(?m)^(\d+\.){2,}\d*\s+[^\s].+$`),                // 多级数字编号：1.1, 1.1.1
		regexp.MustCompile(`(?m)^[一二三四五六七八九十]+[、.．]\s+[^\s：:]+$`),   // 中文编号标题：一、
		regexp.MustCompile(`(?m)^\d+[、.．]\s+[^\s：:]{0,30}$`),              // 数字编号标题：1、
		regexp.MustCompile(`(?m)^\([一二三四五六七八九十\d]+\)\s+[^\s：:]+$`), // 括号编号：(一)
		regexp.MustCompile(`(?m)^\[[一二三四五六七八九十\d]+\]\s+[^\s：:]+$`), // 方括号编号：[一]
	}
)

// sectionBoundary 章节边界信息
type sectionBoundary struct {
	StartPos int
	EndPos   int
	Heading  string
	Content  string
}

// ChunkText 将文本按H2章节贪婪分割：章节内不超过上限就保持完整
func ChunkText(text string, config models.ChunkConfig) []ChunkResult {
	if text == "" {
		return nil
	}

	// 转为 rune 数组处理中文
	runes := []rune(text)

	// 1. 仅按 H2 标题识别章节边界
	sections := detectH2Sections(runes)

	// 2. 贪婪模式：每个章节若不超过上限，直接作为完整分片；超过才内部拆分
	//    同时在 H2 内部合并小于下限的分片（不跨 H2 合并）
	chunks := make([]ChunkResult, 0)
	for _, section := range sections {
		sectionChunks := chunkSectionGreedy(section, config)
		// 在 H2 章节内合并小于下限的分片
		sectionChunks = mergeSmallInH2(sectionChunks, config.MinChunkSize, config.MaxChunkSize, section.Heading)
		chunks = append(chunks, sectionChunks...)
	}

	// 3. 如果没有章节结构，直接按段落切分
	if len(sections) == 0 {
		chunks = chunkParagraphs(runes, 0, "", config)
	}

	// 4. 超出上限时，贪心合并相邻小片
	if len(chunks) > config.MaxChunksPerDoc {
		chunks = reduceChunks(chunks, config.MaxChunksPerDoc)
	}

	return chunks
}

// mergeSmallInH2 在同一 H2 章节内合并小于下限的分片
// 策略：先向后合并，若不行则向前合并（只要合并后不超过上限）
func mergeSmallInH2(chunks []ChunkResult, minSize int, maxSize int, h2Heading string) []ChunkResult {
	if len(chunks) <= 1 {
		return chunks
	}

	result := chunks
	changed := true
	for changed {
		changed = false
		newResult := make([]ChunkResult, 0)
		i := 0

		for i < len(result) {
			current := result[i]
			currentLen := current.RuneLen

			// 如果当前分片过短，尝试合并
			if currentLen < minSize {
				// 优先尝试向后合并
				if i < len(result)-1 {
					next := result[i+1]
					if sameH2Section(current.Heading, next.Heading, h2Heading) {
						nextLen := next.RuneLen
						mergedLen := currentLen + nextLen + separatorLen // "\n\n" 分隔符
						if mergedLen <= maxSize {                       // 确保合并后不超过上限
							mergedContent := current.Content + "\n\n" + next.Content
							merged := ChunkResult{
								Content:   mergedContent,
								RuneLen:   mergedLen,
								StartPos:  current.StartPos,
								EndPos:    next.EndPos,
								Heading:   current.Heading,
								ChunkType: "merged",
							}
							newResult = append(newResult, merged)
							i += 2
							changed = true
							continue
						}
					}
				}

				// 尝试向前合并（与已添加到 newResult 的最后一个分片合并）
				if len(newResult) > 0 {
					prev := &newResult[len(newResult)-1]
					if sameH2Section(prev.Heading, current.Heading, h2Heading) {
						prevLen := prev.RuneLen
						mergedLen := prevLen + currentLen + separatorLen
						if mergedLen <= maxSize { // 确保合并后不超过上限
							prev.Content += "\n\n" + current.Content
							prev.RuneLen = mergedLen
							prev.EndPos = current.EndPos
							prev.ChunkType = "merged"
							i++
							changed = true
							continue
						}
					}
				}
			}

			newResult = append(newResult, current)
			i++
		}

		result = newResult
	}

	return result
}

// sameH2Section 判断两个分片是否属于同一个 H2 章节
// 规则：只有顶级标题相同且匹配当前 H2 章节时才允许合并
func sameH2Section(heading1, heading2, h2Heading string) bool {
	// 提取 H2 顶级标题（去掉 "> 子标题" 部分）
	top1 := extractTopHeading(heading1)
	top2 := extractTopHeading(heading2)

	// 两个分片的顶级标题相同，且与 H2 章节标题匹配，属于同一章节
	if top1 == top2 && top1 == h2Heading {
		return true
	}

	// 无标题分片：只有在另一方属于当前 H2 章节时才允许合并
	// 这确保了不同 H2 章节的无标题内容不会被错误合并
	if heading1 == "" {
		return top2 == h2Heading
	}
	if heading2 == "" {
		return top1 == h2Heading
	}

	return false
}

// extractTopHeading 提取顶级 H2 标题（去掉 "> 子标题" 部分）
func extractTopHeading(heading string) string {
	if idx := strings.Index(heading, " > "); idx > 0 {
		return heading[:idx]
	}
	return heading
}

// reduceChunks 贪心合并相邻分片：每次选总 rune 长度最小的相邻对合并，直到满足上限
func reduceChunks(chunks []ChunkResult, max int) []ChunkResult {
	for len(chunks) > max {
		bestIdx := 0
		bestLen := chunks[0].RuneLen + chunks[1].RuneLen
		for i := 1; i < len(chunks)-1; i++ {
			pairLen := chunks[i].RuneLen + chunks[i+1].RuneLen
			if pairLen < bestLen {
				bestLen = pairLen
				bestIdx = i
			}
		}
		// 合并 bestIdx 和 bestIdx+1
		chunks[bestIdx].Content += "\n\n" + chunks[bestIdx+1].Content
		chunks[bestIdx].RuneLen = chunks[bestIdx].RuneLen + chunks[bestIdx+1].RuneLen + separatorLen
		chunks[bestIdx].EndPos = chunks[bestIdx+1].EndPos
		chunks[bestIdx].ChunkType = "merged"
		chunks = append(chunks[:bestIdx+1], chunks[bestIdx+2:]...)
	}
	return chunks
}

// detectH2Sections 仅检测 H2 章节边界
func detectH2Sections(runes []rune) []sectionBoundary {
	sections := make([]sectionBoundary, 0)
	text := string(runes)

	// 收集所有 H2 标题的位置
	matches := h2Pattern.FindAllStringIndex(text, -1)
	titlePositions := make([]struct {
		pos     int
		heading string
	}, 0, len(matches))

	for _, match := range matches {
		startPos := match[0]
		heading := text[match[0]:match[1]]
		heading = cleanHeading(heading)
		titlePositions = append(titlePositions, struct {
			pos     int
			heading string
		}{posToRuneIndex(runes, startPos), heading})
	}

	// 构建章节区间
	for i, tp := range titlePositions {
		startPos := tp.pos
		endPos := len(runes)
		if i < len(titlePositions)-1 {
			endPos = titlePositions[i+1].pos
		}

		// 章节内容从标题行结束开始
		contentStart := findLineEnd(runes, startPos) + 1
		if contentStart >= endPos {
			contentStart = startPos
		}

		sections = append(sections, sectionBoundary{
			StartPos: startPos,
			EndPos:   endPos,
			Heading:  tp.heading,
			Content:  string(runes[contentStart:endPos]),
		})
	}

	return sections
}

// chunkSectionGreedy 分层递进拆分策略：
// 1. 章节 <= MaxChunkSize，保持完整
// 2. 尝试按 H3 拆分
// 3. 尝试按其他标题格式拆分
// 4. 按段落贪心打包
func chunkSectionGreedy(section sectionBoundary, config models.ChunkConfig) []ChunkResult {
	runes := []rune(section.Content)
	contentLen := len(runes)

	// Level 1: 章节内容不超过上限，直接作为一个完整分片
	if contentLen <= config.MaxChunkSize {
		return []ChunkResult{
			{
				Content:   section.Content,
				RuneLen:   contentLen,
				StartPos:  section.StartPos,
				EndPos:    section.EndPos,
				Heading:   section.Heading,
				ChunkType: "section",
			},
		}
	}

	// Level 2: 尝试按 H3 拆分
	h3Chunks := trySplitByPattern(runes, h3Pattern, section.StartPos, section.Heading, config)
	if len(h3Chunks) > 1 {
		return h3Chunks
	}

	// Level 3: 尝试按其他标题格式拆分
	for _, pattern := range otherHeadingPatterns {
		otherChunks := trySplitByPattern(runes, pattern, section.StartPos, section.Heading, config)
		if len(otherChunks) > 1 {
			return otherChunks
		}
	}

	// Level 4: 按段落贪心打包
	return chunkParagraphs(runes, section.StartPos, section.Heading, config)
}

// trySplitByPattern 尝试按指定正则模式拆分，返回拆分结果
func trySplitByPattern(runes []rune, pattern *regexp.Regexp, offsetStart int, parentHeading string, config models.ChunkConfig) []ChunkResult {
	text := string(runes)
	totalLen := len(runes) // 原始内容总长度
	matches := pattern.FindAllStringIndex(text, -1)

	if len(matches) == 0 {
		return nil // 没有匹配到标题，返回 nil 表示无法按此模式拆分
	}

	// 收集标题位置
	titlePositions := make([]struct {
		pos     int
		heading string
	}, 0, len(matches))

	for _, match := range matches {
		heading := text[match[0]:match[1]]
		heading = cleanHeading(heading)
		titlePositions = append(titlePositions, struct {
			pos     int
			heading string
		}{posToRuneIndex(runes, match[0]), heading})
	}

	// 构建子章节区间并贪婪判断
	chunks := make([]ChunkResult, 0)
	for i, tp := range titlePositions {
		startPos := tp.pos
		endPos := len(runes)
		if i < len(titlePositions)-1 {
			endPos = titlePositions[i+1].pos
		}

		// 子章节内容从标题行结束开始
		contentStart := findLineEnd(runes, startPos) + 1
		if contentStart >= endPos {
			contentStart = startPos
		}

		content := string(runes[contentStart:endPos])
		contentRunes := []rune(content)
		contentLen := len(contentRunes)

		// 组合标题：父标题 > 子标题
		fullHeading := parentHeading + " > " + tp.heading

		// 贪婪判断：子章节不超过上限，保持完整
		if contentLen <= config.MaxChunkSize {
			chunks = append(chunks, ChunkResult{
				Content:   content,
				RuneLen:   contentLen,
				StartPos:  offsetStart + contentStart,
				EndPos:    offsetStart + endPos,
				Heading:   fullHeading,
				ChunkType: "subsection",
			})
		} else {
			// 子章节也超限，继续递进拆分
			subChunks := chunkParagraphs(contentRunes, offsetStart+contentStart, fullHeading, config)
			chunks = append(chunks, subChunks...)
		}
	}

	// 如果只有一个分片且和原内容差不多，说明拆分无效
	if len(chunks) == 1 && chunks[0].RuneLen >= totalLen-splitValidThreshold {
		return nil
	}

	return chunks
}

// chunkParagraphs 按段落贪心打包：累积相邻段落直到接近 MaxChunkSize
func chunkParagraphs(runes []rune, offsetStart int, heading string, config models.ChunkConfig) []ChunkResult {
	chunks := make([]ChunkResult, 0)
	paragraphs := splitByParagraph(runes)

	// 贪心累加器：将短段落尽量打包到一个分片内
	type accEntry struct {
		content   string
		runeLen   int
		startPos  int
		endPos    int
	}
	var acc []accEntry
	accLen := 0 // 已累积段落的纯文本长度之和

	flush := func() {
		if len(acc) == 0 {
			return
		}
		parts := make([]string, len(acc))
		for i, e := range acc {
			parts[i] = e.content
		}
		content := strings.Join(parts, "\n\n")
		runeLen := accLen + (len(acc)-1)*separatorLen // 加上分隔符长度
		chunks = append(chunks, ChunkResult{
			Content:   content,
			RuneLen:   runeLen,
			StartPos:  acc[0].startPos + offsetStart,
			EndPos:    acc[len(acc)-1].endPos + offsetStart,
			Heading:   heading,
			ChunkType: "paragraph",
		})
		acc = nil
		accLen = 0
	}

	for _, para := range paragraphs {
		paraRunes := []rune(para.Content)
		paraLen := len(paraRunes)
		globalStart := para.StartPos + offsetStart

		if paraLen > config.MaxChunkSize {
			// 长段落：先刷出累积的短段落，再单独按长度拆分
			flush()
			subChunks := splitByLength(paraRunes, globalStart, config)
			for i, sc := range subChunks {
				chunkType := "split"
				if i == 0 {
					chunkType = "paragraph_start"
				} else if i == len(subChunks)-1 {
					chunkType = "paragraph_end"
				}
				sc.ChunkType = chunkType
				sc.Heading = heading
				chunks = append(chunks, sc)
			}
			continue
		}

		// 短段落：估算合并后长度（段落间用 \n\n 连接）
		mergedLen := accLen + paraLen
		if len(acc) > 0 {
			mergedLen += separatorLen // "\n\n" 分隔符
		}

		if mergedLen > config.MaxChunkSize && len(acc) > 0 {
			flush()
			acc = append(acc, accEntry{para.Content, paraLen, para.StartPos, para.EndPos})
			accLen = paraLen
		} else {
			acc = append(acc, accEntry{para.Content, paraLen, para.StartPos, para.EndPos})
			accLen = mergedLen
		}
	}

	// 刷出剩余段落
	flush()

	return chunks
}

// paragraphInfo 段落信息
type paragraphInfo struct {
	Content  string
	StartPos int
	EndPos   int
}

// splitByParagraph 按段落分割文本
func splitByParagraph(runes []rune) []paragraphInfo {
	paragraphs := make([]paragraphInfo, 0)

	start := 0
	i := 0
	for i < len(runes) {
		// 寻找段落结束位置 (连续换行)
		if runes[i] == '\n' {
			// 计算连续换行数
			newlineCount := 0
			j := i
			for j < len(runes) && runes[j] == '\n' {
				newlineCount++
				j++
			}

			// 双换行视为段落分隔
			if newlineCount >= paragraphSeparatorNewlines || (newlineCount == 1 && j == len(runes)) {
				// 提取段落
				content := strings.TrimSpace(string(runes[start:i]))
				if len(content) > 0 {
					paragraphs = append(paragraphs, paragraphInfo{
						Content:  content,
						StartPos: start,
						EndPos:   i,
					})
				}
				start = j // 从换行后的位置开始新段落
				i = j
				continue
			}
		}
		i++
	}

	// 处理最后一个段落
	if start < len(runes) {
		content := strings.TrimSpace(string(runes[start:]))
		if len(content) > 0 {
			paragraphs = append(paragraphs, paragraphInfo{
				Content:  content,
				StartPos: start,
				EndPos:   len(runes),
			})
		}
	}

	return paragraphs
}

// splitByLength 按长度切分长段落
func splitByLength(runes []rune, globalStart int, config models.ChunkConfig) []ChunkResult {
	chunks := make([]ChunkResult, 0)
	start := 0
	overlap := config.OverlapSize

	for start < len(runes) {
		end := start + config.MaxChunkSize
		if end > len(runes) {
			end = len(runes)
		}

		// 尝试在句子边界切分
		if end < len(runes) {
			// 向前寻找句子边界 (句号、问号、感叹号)
			sentenceEnd := findSentenceEnd(runes, start, end)
			if sentenceEnd > start + config.MinChunkSize {
				end = sentenceEnd + 1
			}
		}

		chunkRunes := runes[start:end]
		chunks = append(chunks, ChunkResult{
			Content:   string(chunkRunes),
			RuneLen:   len(chunkRunes),
			StartPos:  globalStart + start,
			EndPos:    globalStart + end,
			ChunkType: "split",
		})

		// 下一片开始位置考虑重叠
		nextStart := end - overlap
		if nextStart <= start {
			nextStart = end
		}
		if nextStart >= len(runes) {
			break
		}
		start = nextStart
	}

	return chunks
}

// findSentenceEnd 寻找句子边界
func findSentenceEnd(runes []rune, start, end int) int {
	// 从end向前寻找句子结束符号
	for i := end - 1; i >= start; i-- {
		r := runes[i]
		if r == '.' || r == '。' || r == '?' || r == '？' || r == '!' || r == '！' || r == ';' || r == '；' {
			return i
		}
	}
	return end - 1
}

// cleanHeading 清理章节标题
func cleanHeading(heading string) string {
	heading = strings.TrimSpace(heading)
	// 去除 Markdown 标题符号
	if strings.HasPrefix(heading, "#") {
		heading = strings.TrimLeft(heading, "# ")
	}
	return heading
}

// posToRuneIndex 将字节位置转换为 rune 索引
func posToRuneIndex(runes []rune, bytePos int) int {
	text := string(runes)
	if bytePos > len(text) {
		return len(runes)
	}
	// 计算该字节位置对应的 rune 索引
	count := 0
	for i := 0; i < bytePos && count < len(runes); {
		r := runes[count]
		i += len(string(r))
		count++
	}
	return count
}

// findLineEnd 找到行的结束位置
func findLineEnd(runes []rune, start int) int {
	for i := start; i < len(runes); i++ {
		if runes[i] == '\n' {
			return i
		}
	}
	return len(runes)
}