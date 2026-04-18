package chunker

import (
	"regexp"
	"sort"
	"strings"

	"note_all_backend/models"
)

// ChunkResult 分片结果
type ChunkResult struct {
	Content   string
	StartPos  int
	EndPos    int
	Heading   string
	ChunkType string
}

// 章节标题识别正则模式
var sectionPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?m)^#{1,6}\s+.+$`),                            // Markdown标题 # ## ###
	regexp.MustCompile(`(?m)^第[一二三四五六七八九十\d]+[章节部篇].*$`),       // 中文章节
	regexp.MustCompile(`(?m)^(\d+\.)+\d*\s+.+$`),                       // 数字编号 1. 1.1 1.1.1
	regexp.MustCompile(`(?m)^第[一二三四五六七八九十]+[、.．]\s+.+$`),        // 中文编号 一、
	regexp.MustCompile(`(?m)^\d+[、.．]\s+.+$`),                         // 数字编号 1、
	regexp.MustCompile(`(?m)^\([一二三四五六七八九十\d]+\)[\s]*.+$`),       // 括号编号 (一) (1)
	regexp.MustCompile(`(?m)^\[[一二三四五六七八九十\d]+\][\s]*.+$`),       // 方括号编号 [一] [1]
}

// sectionBoundary 章节边界信息
type sectionBoundary struct {
	StartPos int
	EndPos   int
	Heading  string
	Content  string
}

// ChunkText 将文本按章节+段落+长度区间策略分片
func ChunkText(text string, config models.ChunkConfig) []ChunkResult {
	if text == "" {
		return nil
	}

	// 转为 rune 数组处理中文
	runes := []rune(text)

	// 1. 识别章节边界
	sections := detectSections(runes)

	// 2. 每个章节内按段落切分
	chunks := make([]ChunkResult, 0)
	for _, section := range sections {
		sectionChunks := chunkSection(section, config)
		chunks = append(chunks, sectionChunks...)
	}

	// 3. 如果没有章节结构，直接按段落切分
	if len(sections) == 0 {
		chunks = chunkParagraphs(runes, 0, len(runes), "", config)
	}

	// 4. 合并过短分片
	chunks = mergeSmallChunks(chunks, config.MinChunkSize)

	// 5. 限制分片数量（保留最后一片确保文档完整性）
	if len(chunks) > config.MaxChunksPerDoc {
		lastChunk := chunks[len(chunks)-1]
		chunks = chunks[:config.MaxChunksPerDoc-1]
		chunks = append(chunks, lastChunk)
	}

	return chunks
}

// detectSections 检测章节边界
func detectSections(runes []rune) []sectionBoundary {
	sections := make([]sectionBoundary, 0)
	text := string(runes)

	// 收集所有章节标题的位置
	titlePositions := make([]struct {
		pos     int
		heading string
	}, 0)

	for _, pattern := range sectionPatterns {
		matches := pattern.FindAllStringIndex(text, -1)
		for _, match := range matches {
			startPos := match[0]
			heading := text[match[0]:match[1]]
			// 清理标题，去除前缀符号
			heading = cleanHeading(heading)

			// 检查是否已存在更近的标题位置
			exists := false
			for _, tp := range titlePositions {
				if abs(tp.pos-posToRuneIndex(runes, startPos)) < 10 {
					exists = true
					break
				}
			}
			if !exists {
				titlePositions = append(titlePositions, struct {
					pos     int
					heading string
				}{posToRuneIndex(runes, startPos), heading})
			}
		}
	}

	// 按位置排序 (O(n log n))
	sort.Slice(titlePositions, func(i, j int) bool {
		return titlePositions[i].pos < titlePositions[j].pos
	})

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

// chunkSection 对单个章节进行分片
func chunkSection(section sectionBoundary, config models.ChunkConfig) []ChunkResult {
	runes := []rune(section.Content)
	return chunkParagraphs(runes, section.StartPos, section.EndPos, section.Heading, config)
}

// chunkParagraphs 按段落切分，长段落按长度再切分
func chunkParagraphs(runes []rune, offsetStart, offsetEnd int, heading string, config models.ChunkConfig) []ChunkResult {
	chunks := make([]ChunkResult, 0)

	// 按段落分割 (双换行或单换行)
	paragraphs := splitByParagraph(runes)

	for _, para := range paragraphs {
		paraRunes := []rune(para.Content)
		paraLen := len(paraRunes)

		// 段落位置需要加上全局偏移
		globalStart := para.StartPos + offsetStart
		globalEnd := para.EndPos + offsetStart

		if paraLen <= config.MaxChunkSize {
			// 段落长度适中，直接成片
			chunks = append(chunks, ChunkResult{
				Content:   para.Content,
				StartPos: globalStart,
				EndPos:   globalEnd,
				Heading:   heading,
				ChunkType: "paragraph",
			})
		} else {
			// 段落过长，按长度切分
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
		}
	}

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
			if newlineCount >= 2 || (newlineCount == 1 && j == len(runes)) {
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

		chunks = append(chunks, ChunkResult{
			Content:   string(runes[start:end]),
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

// mergeSmallChunks 合并过短分片
func mergeSmallChunks(chunks []ChunkResult, minSize int) []ChunkResult {
	if len(chunks) <= 1 {
		return chunks
	}

	// 循环合并直到没有短分片或无法合并
	result := chunks
	changed := true
	for changed {
		changed = false
		newResult := make([]ChunkResult, 0)
		i := 0

		for i < len(result) {
			current := result[i]

			// 如果当前分片过短，尝试与相邻分片合并
			if len([]rune(current.Content)) < minSize && i < len(result)-1 {
				next := result[i+1]
				// 检查是否可以合并 (同章节或无章节)
				if current.Heading == next.Heading || current.Heading == "" || next.Heading == "" {
					merged := ChunkResult{
						Content:   current.Content + "\n" + next.Content,
						StartPos:  current.StartPos,
						EndPos:    next.EndPos,
						Heading:   next.Heading,
						ChunkType: "merged",
					}
					newResult = append(newResult, merged)
					i += 2
					changed = true
					continue
				}
			}

			newResult = append(newResult, current)
			i++
		}

		result = newResult
	}

	return result
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

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}