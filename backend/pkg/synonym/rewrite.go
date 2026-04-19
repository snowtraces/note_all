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
	err := segmenter.LoadDict("./libs/gse/zh/s_1.txt", "./libs/gse/zh/t_1.txt")
	if err != nil {
		log.Printf("[Synonym] 载入分词字典失败: %v", err)
	}
}

// isNoun 判断词性是否为名词 (n, nr, ns, nt, nz 等)
func isNoun(pos string) bool {
	return strings.HasPrefix(pos, "n") && pos != "nrfg" && pos != "nrt"
}

// RewriteQuery 使用同义词词典重写查询，仅对名词扩展
func RewriteQuery(query string) []string {
	// 1. 分词并获取词性
	segments := segmenter.Cut(query, true)
	posTags := segmenter.Pos(query, true)

	log.Printf("[Synonym] Query: %s, Segments: %v, Pos: %v", query, segments, posTags)

	expandedQueries := []string{query}

	// 2. 构建词性映射
	posMap := make(map[string]string)
	for _, tag := range posTags {
		posMap[tag.Text] = tag.Pos
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

	// 最多处理前两个名词候选词
	for i, cand := range candidates {
		if i >= 2 {
			break
		}

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

	// 添加名词本身作为独立词
	for _, seg := range segments {
		if posMap[seg] == "" || !isNoun(posMap[seg]) {
			continue
		}
		if len([]rune(seg)) >= 2 {
			expandedQueries = append(expandedQueries, seg)
		}
	}

	// 加上去掉主语、停用词后的词语
	stopwords := []string{"我", "你", "他", "她", "它", "的", "是", "在", "有", "了", "吗", "呢", "吧", "啊", "呀", "哇", "哦", "嗯", "什么", "怎么", "如何", "为什么", "哪", "谁", "哪里", "哪个", "是否", "能不能", "可以"}
	for _, seg := range segments {
		if len([]rune(seg)) < 2 {
			continue
		}
		// 跳过停用词
		isStopword := false
		for _, sw := range stopwords {
			if seg == sw {
				isStopword = true
				break
			}
		}
		if isStopword {
			continue
		}
		// 跳过已添加的名词
		if isNoun(posMap[seg]) {
			continue
		}
		expandedQueries = append(expandedQueries, seg)
	}

	log.Printf("[Synonym] Expanded queries: %v", expandedQueries)
	return unique(expandedQueries)
}

// GetSynonyms 查找一个词的同义词
func GetSynonyms(word string) []string {
	var groupIDs []string

	ftsQuery := `
		SELECT group_id FROM synonyms WHERE word LIKE ? AND type = '='
		UNION
		SELECT s.group_id
		FROM synonyms s
		JOIN synonym_fts f ON s.id = f.rowid
		WHERE f.word MATCH ? AND s.type = '='
	`
	global.DB.Raw(ftsQuery, "%"+word+"%", "\""+word+"\"").Scan(&groupIDs)

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
