package synonym

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"note_all_backend/global"
	"note_all_backend/models"

	"github.com/yanyiwu/gojieba"
)

var jieba *gojieba.Jieba

func init() {
	exePath, _ := os.Executable()
	dictDir := filepath.Join(filepath.Dir(exePath), "libs", "jieba")

	jieba = gojieba.NewJieba(
		filepath.Join(dictDir, "jieba.dict.utf8"),
		filepath.Join(dictDir, "hmm_model.utf8"),
		filepath.Join(dictDir, "user.dict.utf8"),
		filepath.Join(dictDir, "idf.utf8"),
		filepath.Join(dictDir, "stop_words.utf8"),
	)
}

// GetJieba 获取全局 Jieba 实例
func GetJieba() *gojieba.Jieba {
	return jieba
}

// isNoun 判断词性是否为名词 (n, nr, ns, nt, nz 等)
func isNoun(pos string) bool {
	return strings.HasPrefix(pos, "n") && pos != "nrfg" && pos != "nrt"
}

// RewriteQuery 使用同义词词典重写查询，仅对名词扩展
func RewriteQuery(query string) []string {
	// 1. 分词并获取词性
	segments := jieba.Cut(query, true)
	posTags := jieba.Tag(query)

	log.Printf("[Synonym] Query: %s, Segments: %v, Pos: %v", query, segments, posTags)

	// 2. 构建词性映射
	posMap := make(map[string]string)
	for _, tag := range posTags {
		parts := strings.SplitN(tag, "/", 2)
		if len(parts) == 2 {
			posMap[parts[0]] = parts[1]
		}
	}

	// 3. 只对名词进行同义词扩展
	type wordExpand struct {
		original string
		synonyms []string
	}

	var candidates []wordExpand
	for _, seg := range segments {
		if len([]rune(seg)) < 2 {
			continue
		}

		pos := posMap[seg]
		if !isNoun(pos) {
			continue // 只处理名词
		}

		syns := GetSynonyms(seg)
		if len(syns) > 1 {
			candidates = append(candidates, wordExpand{
				original: seg,
				synonyms: syns,
			})
		}
	}

	// 4. 控制结果数量和质量
	// 如果查询太长（比如超过 30 个字符），我们就不生成全句副本了，因为全句 FTS 匹配概率本来就很低
	isLongQuery := len([]rune(query)) > 30
	var finalResults []string
	
	if !isLongQuery {
		finalResults = append(finalResults, query)
		// 添加前 2 个名词的替换版本
		count := 0
		for _, cand := range candidates {
			if count >= 2 { break }
			for _, s := range cand.synonyms {
				if s == cand.original { continue }
				finalResults = append(finalResults, strings.Replace(query, cand.original, s, 1))
				count++
				if count >= 2 { break }
			}
		}
	}

	// 5. 提取并添加所有核心关键词（无论查询长短，关键词都是最有用的）
	for _, seg := range segments {
		if len([]rune(seg)) < 2 { continue }
		
		pos := posMap[seg]
		// 只要是名词或动词（排除常见的语气助词和停用词）
		if isNoun(pos) || strings.HasPrefix(pos, "v") {
			// 跳过常见废话动词
			if seg == "进行" || seg == "讨论" || seg == "要求" || seg == "帮我" {
				continue
			}
			finalResults = append(finalResults, seg)
			
			// 如果是名词，也加上它的同义词
			if isNoun(pos) {
				syns := GetSynonyms(seg)
				for _, s := range syns {
					if s != seg && len(finalResults) < 15 { // 限制总数
						finalResults = append(finalResults, s)
					}
				}
			}
		}
	}

	log.Printf("[Synonym] Expanded queries (optimized): %v", finalResults)
	return unique(finalResults)
}

// GetSynonyms 查找一个词的同义词
func GetSynonyms(word string) []string {
	var groupIDs []string

	ftsQuery := `
		SELECT group_id FROM synonyms WHERE word = ? AND type = '='
	`
	global.DB.Raw(ftsQuery, word).Scan(&groupIDs)

	if len(groupIDs) == 0 {
		return nil
	}

	var synRecords []models.Synonym
	global.DB.Where("group_id IN ? AND type = '='", groupIDs).Find(&synRecords)

	var result []string
	for _, r := range synRecords {
		result = append(result, r.Word)
	}
	return unique(result)
}

func unique(slice []string) []string {
	keys := make(map[string]bool)
	list := []string{}
	for _, entry := range slice {
		if _, value := keys[entry]; !value {
			keys[entry] = true
			list = append(list, entry)
		}
	}
	return list
}