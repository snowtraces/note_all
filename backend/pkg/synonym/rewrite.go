package synonym

import (
	"log"
	"strings"

	"note_all_backend/global"
	"note_all_backend/models"

	"github.com/go-ego/gse"
)

var segmenter gse.Segmenter

func init() {
	// 初始化分词器，加载默认字典
	err := segmenter.LoadDict()
	if err != nil {
		log.Printf("[Synonym] 载入分词字典失败: %v", err)
	}
}

// RewriteQuery 使用同义词词典重写查询
func RewriteQuery(query string) []string {
	// 1. 分词
	segments := segmenter.Cut(query, true)
	log.Printf("[Synonym] Query: %s, Segments: %v", query, segments)

	// 2. 对每个词查找同义词
	// 为了简单起见，我们生成 2 个额外的扩展查询
	// 策略：找到最长的 1-2 个词，替换为同义词

	expandedQueries := []string{query}

	// 找出可以扩展的词
	type wordExpand struct {
		original string
		synonyms []string
	}

	var candidates []wordExpand
	for _, seg := range segments {
		if len([]rune(seg)) < 2 {
			continue // 忽略单字
		}

		syns := GetSynonyms(seg)
		if len(syns) > 1 {
			candidates = append(candidates, wordExpand{
				original: seg,
				synonyms: syns,
			})
		}
	}

	// 简单的重写策略：
	// 如果有 candidate，取前两个同义词组成新查询
	for i, cand := range candidates {
		if i >= 2 {
			break
		} // 最多处理前两个候选词

		count := 0
		for _, s := range cand.synonyms {
			if s == cand.original {
				continue
			}

			newQuery := strings.Replace(query, cand.original, s, 1)
			expandedQueries = append(expandedQueries, newQuery)

			count++
			if count >= 2 {
				break
			}
		}
	}

	// 加上去掉主语、停用词后的词语
	for _, seg := range segments {
		if seg == "我" || seg == "的" || seg == "是" || seg == "在" || seg == "有" || seg == "了" || seg == "吗" || seg == "呢" || seg == "吧" || seg == "啊" || seg == "呀" || seg == "哇" || seg == "哦" || seg == "嗯" {
			continue
		}
		expandedQueries = append(expandedQueries, seg)
	}

	log.Printf("[Synonym] Expanded queries: %v", expandedQueries)

	// 去重
	return unique(expandedQueries)
}

// GetSynonyms 查找一个词的同义词
func GetSynonyms(word string) []string {
	var groupIDs []string

	// 使用 UNION 结合 FTS MATCH 和 LIKE 查找，避免 MATCH 在 OR 中导致的 SQL 错误
	ftsQuery := `
		SELECT group_id FROM synonyms WHERE word LIKE ? AND type = '='
		UNION
		SELECT s.group_id 
		FROM synonyms s 
		JOIN synonym_fts f ON s.id = f.rowid 
		WHERE f.word MATCH ? AND s.type = '='
	`
	// 参数顺序：LIKE 的 pattern，MATCH 的 pattern
	global.DB.Raw(ftsQuery, "%"+word+"%", "\""+word+"\"").Scan(&groupIDs)

	if len(groupIDs) == 0 {
		return nil
	}

	// 根据 GroupID 找到所有同类词
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
