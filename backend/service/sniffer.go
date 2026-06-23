package service

import (
	"fmt"
	"log"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg"
)

// SniffWikiConceptsBackground 延迟触发词条嗅探任务
func SniffWikiConceptsBackground(noteID uint) {
	log.Printf("[后台嗅探器] 已接收到笔记 %d，将在 10 秒后启动 Wiki 概念嗅探...", noteID)
	// 稍微延迟，不抢占刚刚完成分析的 CPU/网络 资源
	time.AfterFunc(10*time.Second, func() {
		log.Printf("[后台嗅探器] 正在处理笔记 %d...", noteID)
		err := SniffWikiConcepts(noteID)
		if err != nil {
			log.Printf("[后台嗅探器] 处理笔记 %d 时发生错误: %v", noteID, err)
		}
	})
}

// SniffWikiConcepts 真正执行大模型概念提取
func SniffWikiConcepts(noteID uint) error {
	var note models.NoteItem
	if err := global.DB.First(&note, noteID).Error; err != nil {
		return fmt.Errorf("找不到笔记: %v", err)
	}

	if note.OcrText == "" {
		return nil
	}

	systemPrompt := `你是一个专业的个人知识库 (PKM) 标签与实体提取专家。
请阅读用户提供的笔记内容，从中提取出 1~3 个**最具代表性、具体且值得作为独立知识节点（Wiki）的核心概念或实体**。

【颗粒度约束（至关重要）】
在个人知识库中，概念需要有针对性，切忌过度抽象！
1. **保留特定上下文（拒绝过度抽象）**：如果笔记在探讨具体的特定业务，必须保留专有名词、公司名或产品线等限定词。不要将其抽象为教科书名词。
   - 错误 ❌：“推荐系统”、“创作者激励” （太泛了，失去了个人笔记的上下文）
   - 正确 ✅：“小红书视频推荐”、“小红书视频激励计划”
2. **提炼核心名词（拒绝冗长业务句）**：提取的必须是复合名词，绝对不要提取包含具体动作、细枝末节说明的整句话。
   - 错误（太碎） ❌：“小红书原创保护误判补偿机制” -> 应该提炼为 ✅：“小红书原创保护”
   - 错误（太碎） ❌：“中长视频长效推荐机制” -> 应该提炼为 ✅：“中长视频推荐” 或 “长效推荐机制”
   - 错误（太碎） ❌：“小红书音频一级入口” -> 应该提炼为 ✅：“小红书音频播客”
3. **字数与词性**：提取的必须是“名词/名词短语”，字数一般在 3 到 20 个字之间。宁缺毋滥。

你必须严格只输出以下格式的纯JSON字符串（绝对不要带 markdown 标记或多余的文字）：
{
  "concepts": ["概念1", "概念2"]
}
`

	messages := []map[string]string{
		{"role": "user", "content": note.OcrText},
	}

	log.Printf("[后台嗅探器] 开始为笔记 %d 呼叫大模型提取知识点...", noteID)
	resp, err := pkg.AskAI(messages, systemPrompt)
	if err != nil {
		return fmt.Errorf("调用大模型嗅探失败: %v", err)
	}
	log.Printf("[后台嗅探器] 笔记 %d 提取完毕，大模型返回内容: %s", noteID, resp)

	var extract struct {
		Concepts []string `json:"concepts"`
	}

	if err := pkg.ParseSmartJSON(resp, &extract); err != nil {
		return fmt.Errorf("解析嗅探结果 JSON 失败: %v, resp: %s", err, resp)
	}

	if len(extract.Concepts) == 0 {
		log.Printf("[后台嗅探器] 笔记 %d 经大模型判定，无有价值的百科概念。", noteID)
		return nil
	}

	// 将提取到的概念写入 PendingWikiTask，同时去重
	validConceptsCount := 0
	for _, concept := range extract.Concepts {
		if concept == "" {
			continue
		}

		// 调用消歧义模块（检索 + LLM）来归一化名称
		concept = disambiguateConcept(concept)

		// 检查是否已经存在于 WikiEntity 中
		var existingWiki models.WikiEntity
		global.DB.Where("name = ?", concept).Limit(1).Find(&existingWiki)
		if existingWiki.ID != 0 {
			log.Printf("[嗅探器] 概念 '%s' 已存在于百科库中，开始关联与静默融合...", concept)

			// 创建引用关联
			ref := models.WikiReference{
				WikiEntityID: existingWiki.ID,
				NoteID:       noteID,
			}
			if err := global.DB.FirstOrCreate(&ref, models.WikiReference{WikiEntityID: existingWiki.ID, NoteID: noteID}).Error; err != nil {
				log.Printf("[嗅探器] 创建 Wiki 关联失败: %v", err)
			} else {
				// 发送前端通知（由于关联了新素材，可以立即刷新一下引证列表）
				global.SSEBus.Publish("wiki_compiled")

				// 触发增量融合后台任务 (静默更新正文)
				go UpdateWikiConceptBackground(existingWiki.ID, noteID)
			}
			continue
		}

		// 检查是否已经在待办列表中（或者被拒绝过）
		var existingTask models.PendingWikiTask
		global.DB.Where("concept_name = ?", concept).Limit(1).Find(&existingTask)
		if existingTask.ID != 0 {
			log.Printf("[后台嗅探器] 概念 '%s' 已在待办列表中，跳过", concept)
			continue
		}

		// 写入一条新任务
		newTask := models.PendingWikiTask{
			ConceptName:  concept,
			SourceNoteID: noteID,
			Status:       "pending",
		}
		if err := global.DB.Create(&newTask).Error; err != nil {
			log.Printf("[后台嗅探器] 写入词条任务 %s 失败: %v", concept, err)
		} else {
			log.Printf("[后台嗅探器] 成功捕捉新概念: %s (源笔记: %d)", concept, noteID)
			validConceptsCount++
		}
	}

	if validConceptsCount > 0 {
		// 通过 SSE 发送通知给前端气泡
		global.SSEBus.Publish("wiki_sniffed")
	} else {
		log.Printf("[后台嗅探器] 笔记 %d 提取出的概念已被全部过滤（已存在或为空），无新任务", noteID)
	}

	return nil
}

// disambiguateConcept 执行“检索 + 拍板”两阶段消歧义逻辑
func disambiguateConcept(concept string) string {
	// 1. 通过简单的字符串模糊匹配（双向 LIKE）召回疑似候选词
	var wikiCandidates []string
	global.DB.Model(&models.WikiEntity{}).
		Where("name LIKE ? OR ? LIKE '%' || name || '%'", "%"+concept+"%", concept).
		Limit(10).
		Pluck("name", &wikiCandidates)

	var taskCandidates []string
	global.DB.Model(&models.PendingWikiTask{}).
		Where("concept_name LIKE ? OR ? LIKE '%' || concept_name || '%'", "%"+concept+"%", concept).
		Limit(10).
		Pluck("concept_name", &taskCandidates)

	// 合并并去重候选词
	candidateMap := make(map[string]bool)
	for _, c := range wikiCandidates {
		candidateMap[c] = true
	}
	for _, c := range taskCandidates {
		candidateMap[c] = true
	}

	if len(candidateMap) == 0 {
		// 如果没有任何疑似候选词，直接认定为新词条，无需麻烦 LLM
		return concept
	}

	var candidates []string
	for c := range candidateMap {
		// 如果发现极其接近的精确无视大小写匹配，直接硬编码返回，省掉一次 LLM 费用
		if strings.EqualFold(c, concept) {
			log.Printf("[嗅探-消歧义] 命中精确忽略大小写匹配: '%s' -> '%s'", concept, c)
			return c
		}
		candidates = append(candidates, c)
	}

	// 2. 调用 LLM 从候选列表中做选择题
	systemPrompt := `你是一个专业且严谨的百科词条消歧义专家。
用户提取了一个新概念：【%s】
目前数据库中已经存在以下可能相关的候选词条：
%v

请判断新概念是否在语义上等价于上述列表中的某一个词条？（例如它们是缩写与全称、中英互译、同义词、大小写差异等关系）
- 如果等价，请你必须原封不动地输出那个已有的词条名称（绝对不要输出任何其他解释）。
- 如果不等价（即它是一个全新的、不同的概念），请你原封不动地输出新概念名称本身。

你只能输出最终的词条名称，不要包含任何多余的字符、引号或解释。`

	systemPrompt = fmt.Sprintf(systemPrompt, concept, candidates)

	messages := []map[string]string{
		{"role": "user", "content": "请判断并输出合并后的唯一名称。"},
	}

	resp, err := pkg.AskAI(messages, systemPrompt)
	if err != nil {
		log.Printf("[嗅探-消歧义] LLM调用失败，回退为原词条名: %v", err)
		return concept
	}

	finalConcept := strings.TrimSpace(resp)
	finalConcept = strings.Trim(finalConcept, "\"'`\n")

	log.Printf("[嗅探-消歧义] 新概念 '%s' 经 LLM 判定为 -> '%s' (候选池: %v)", concept, finalConcept, candidates)
	return finalConcept
}
