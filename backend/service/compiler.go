package service

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg"
)

var pendingUpdates sync.Map

type updateTask struct {
	timer   *time.Timer
	noteIDs []uint
	mu      sync.Mutex
}

const wikiStructurePrompt = `
【词条结构要求】
词条必须严格包含以下 5 个模块，请使用 Markdown 格式排版（支持高亮、代码块、引用等）：

## 简介 (Overview)
[一段话综述该概念的本质、背景以及核心用途，作为词条的基调。加粗核心主语。]

## 核心原理解析 (Core Concepts)
[提取碎片中的技术细节、实现原理或关键特质进行系统化分类说明。鼓励使用多级标题或列表拆解。]

## 关键特征与优势 (Features & Advantages)
[提炼该概念的优点和特性。请使用无序列表加粗，如“- **特征一**：说明...”]

## 典型应用场景与实践 (Use Cases & Practices)
[基于碎片内容，说明该概念在什么场景下被使用，如何解决实际问题，包含代码片段或配置示例等。]

## 局限与避坑指南 (Limitations & Gotchas)
[该概念的缺点、适用边界，以及在碎片中经常提及的踩坑点、最佳实践等。如果没有提及可基于通用知识补充，但需标注。]
`

const jsonOutputPromptWithNoChange = `
请注意，你必须严格只输出以下格式的JSON字符串，绝对不要包裹 markdown (如 ˋˋˋjson) 或其他多余文字：
{
  "no_change": false,
  "summary": "重写后的核心定义（纯文本，如果无需更新可沿用旧版摘要）",
  "content": "重写后完整的 5 大模块排版的 Markdown 正文"
}
`

// CompileWikiConcept 执行 RAG 炼金，生成词条
func CompileWikiConcept(taskID uint) error {
	var task models.PendingWikiTask
	if err := global.DB.First(&task, taskID).Error; err != nil {
		return fmt.Errorf("task not found: %v", err)
	}

	if task.Status != "pending" {
		return fmt.Errorf("task is not pending, current status: %s", task.Status)
	}

	conceptName := task.ConceptName
	log.Printf("[Compiler] 开始炼金编纂概念: %s", conceptName)

	// 1. 检索包含此概念的相关笔记
	var notes []models.NoteItem
	query := fmt.Sprintf("%%%s%%", conceptName)
	if err := global.DB.Where("ocr_text LIKE ? OR ai_summary LIKE ?", query, query).Limit(10).Find(&notes).Error; err != nil {
		log.Printf("[Compiler] 模糊搜索关联笔记出错: %v", err)
	}

	// 确保生成该任务的原始笔记一定在上下文里，防止 LLM 提取的词汇是变体/总结词导致 LIKE 搜不到
	sourceExists := false
	for _, n := range notes {
		if n.ID == task.SourceNoteID {
			sourceExists = true
			break
		}
	}

	if !sourceExists && task.SourceNoteID != 0 {
		var sourceNote models.NoteItem
		if err := global.DB.First(&sourceNote, task.SourceNoteID).Error; err == nil {
			// 把源笔记放在第一位
			notes = append([]models.NoteItem{sourceNote}, notes...)
		}
	}

	if len(notes) == 0 {
		global.DB.Model(&task).Update("status", "rejected")
		return fmt.Errorf("no related notes found for concept: %s (and source note missing)", conceptName)
	}

	// 2. 组装 RAG Context
	var contextBuilder strings.Builder
	for i, n := range notes {
		contextBuilder.WriteString(fmt.Sprintf("\n--- Fragment %d (ID:%d) ---\n", i+1, n.ID))
		contextBuilder.WriteString(n.OcrText)
	}

	// 3. 构建 Prompt 发给大模型
	systemPrompt := `你是一个专业严谨的 Wiki 百科编辑。
请根据用户提供的相关笔记碎片，为一个名为【` + conceptName + `】的知识概念编纂一篇结构化、高质量的百科词条。
` + wikiStructurePrompt + `
【严谨性申明】
如果提供的碎片内容不足以写出完整的词条，请基于你的先验知识补充，但你**必须使用斜体或引用块明确指出哪些是基于碎片的，哪些是补充的**。

你必须严格只输出以下格式的JSON字符串，绝对不要包裹 markdown (如 ˋˋˋjson) 或其他多余的文字：
{
  "summary": "一句话核心定义（纯文本，约30字以内）",
  "content": "完整的按照上述 5 大模块排版的 Markdown 格式正文"
}
`

	messages := []map[string]string{
		{"role": "user", "content": contextBuilder.String()},
	}

	resp, err := pkg.AskAI(messages, systemPrompt)
	if err != nil {
		return fmt.Errorf("LLM error during compile: %v", err)
	}

	var extract struct {
		Summary string `json:"summary"`
		Content string `json:"content"`
	}

	if err := pkg.ParseSmartJSON(resp, &extract); err != nil {
		return fmt.Errorf("parse JSON failed: %v, resp: %s", err, resp)
	}

	// 4. 落库
	tx := global.DB.Begin()
	wiki := models.WikiEntity{
		Name:    conceptName,
		Summary: extract.Summary,
		Content: extract.Content,
	}
	if err := tx.Create(&wiki).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("create wiki entity failed: %v", err)
	}

	// 建立双向关联
	for _, n := range notes {
		ref := models.WikiReference{
			WikiEntityID: wiki.ID,
			NoteID:       n.ID,
		}
		if err := tx.Create(&ref).Error; err != nil {
			log.Printf("[Compiler] create reference failed for NoteID %d: %v", n.ID, err)
		}
	}

	// 更新任务状态
	task.Status = "accepted"
	if err := tx.Save(&task).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("update task status failed: %v", err)
	}

	tx.Commit()

	// 通知前端刷新
	global.SSEBus.Publish("wiki_compiled")

	return nil
}

// RejectWikiConcept 忽略词条
func RejectWikiConcept(taskID uint) error {
	return global.DB.Model(&models.PendingWikiTask{}).Where("id = ?", taskID).Update("status", "rejected").Error
}

// UpdateWikiConceptBackground 延迟触发增量融合
func UpdateWikiConceptBackground(wikiID, noteID uint) {
	log.Printf("[增量融合] 已接收到词条 %d 与新笔记 %d 的融合请求...", wikiID, noteID)

	val, _ := pendingUpdates.LoadOrStore(wikiID, &updateTask{})
	task := val.(*updateTask)

	task.mu.Lock()
	defer task.mu.Unlock()

	// 收集 noteID
	task.noteIDs = append(task.noteIDs, noteID)

	// 重置定时器
	if task.timer != nil {
		task.timer.Stop()
	}

	task.timer = time.AfterFunc(5*time.Second, func() {
		// 定时器触发时，取出收集到的笔记 IDs
		task.mu.Lock()
		noteIDsToProcess := make([]uint, len(task.noteIDs))
		copy(noteIDsToProcess, task.noteIDs)
		task.noteIDs = nil // 清空
		task.timer = nil
		
		// 任务已取出，从 map 中清理，防止长期运行积累幽灵 key
		pendingUpdates.Delete(wikiID)
		
		task.mu.Unlock()

		if len(noteIDsToProcess) > 0 {
			log.Printf("[增量融合] 开始去抖处理词条 %d, 合并 %d 篇笔记...", wikiID, len(noteIDsToProcess))
			err := UpdateWikiConcept(wikiID, noteIDsToProcess)
			if err != nil {
				log.Printf("[增量融合] 词条 %d 增量融合失败: %v", wikiID, err)
			}
		}
	})
}

// UpdateWikiConcept 增量改写词条
func UpdateWikiConcept(wikiID uint, noteIDs []uint) error {
	var wiki models.WikiEntity
	if err := global.DB.First(&wiki, wikiID).Error; err != nil {
		return fmt.Errorf("wiki entity not found: %v", err)
	}

	// 抓取所有涉及的笔记
	var notes []models.NoteItem
	if err := global.DB.Where("id IN ?", noteIDs).Find(&notes).Error; err != nil {
		return fmt.Errorf("note items not found: %v", err)
	}

	var newContentBuilder strings.Builder
	for i, note := range notes {
		if note.OcrText != "" {
			newContentBuilder.WriteString(fmt.Sprintf("\n--- 新笔记碎片 %d (ID:%d) ---\n", i+1, note.ID))
			newContentBuilder.WriteString(note.OcrText)
		}
	}

	newContent := newContentBuilder.String()
	if newContent == "" {
		return nil
	}

	log.Printf("[Compiler] 开始增量编织词条: %s (接入笔记数量: %d)", wiki.Name, len(notes))

	// 构建增量 Prompt 发给大模型
	systemPrompt := `你是一个专业且精密的知识百科维护者（Wiki Editor）。
系统目前已经存有一篇关于【` + wiki.Name + `】的优质结构化词条，包含了 5 大标准模块（简介、核心原理解析、关键特征与优势、典型应用场景与实践、局限与避坑指南）。

现在，用户刚刚记录了与【` + wiki.Name + `】相关的新笔记碎片。
你的任务是：仔细阅读这些新笔记，从中提取有价值的、全新的技术细节、见解或示例，并将它们**无缝扩写、插入或修补**到当前旧词条的对应模块中去。

【操作守则】
1. **绝对不要破坏现存的 Markdown 结构**：必须保留原始的 5 个大标题模块。
2. **严丝合缝地融合**：不要在结尾生硬地追加“新笔记补充：”，而是要把新知识消化后自然地融进原有正文中。
3. **补充与冲突**：如果新笔记与原有观点冲突，请以补充或对比的形式保留（例如：“另有实践指出...”）。
4. **价值过滤**：如果新笔记毫无价值或并未提供增量知识，请尽可能原样保留旧词条的内容，不要随意删减。
5. **无增量即免写**：如果新笔记完全没有提供任何新知识、新细节或新观点（例如只是旧词条已有内容的复述或无关紧要的杂谈），你不需要重写整篇词条，只需设置 "no_change": true。

【旧词条当前内容】
` + wiki.Content + "\n" + jsonOutputPromptWithNoChange

	messages := []map[string]string{
		{"role": "user", "content": "这是本次新摄入的笔记碎片集合：\n" + newContent},
	}

	resp, err := pkg.AskAI(messages, systemPrompt)
	if err != nil {
		return fmt.Errorf("LLM error during incremental compile: %v", err)
	}

	var extract struct {
		NoChange bool   `json:"no_change"`
		Summary  string `json:"summary"`
		Content  string `json:"content"`
	}

	if err := pkg.ParseSmartJSON(resp, &extract); err != nil {
		return fmt.Errorf("parse JSON failed: %v, resp: %s", err, resp)
	}

	if extract.NoChange {
		log.Printf("[Compiler] 增量融合: %s 判定为无增量价值，跳过重写。", wiki.Name)
		return nil
	}

	// 落库更新
	if err := global.DB.Model(&wiki).Updates(map[string]interface{}{
		"summary": extract.Summary,
		"content": extract.Content,
	}).Error; err != nil {
		return fmt.Errorf("update wiki entity failed: %v", err)
	}

	log.Printf("[Compiler] 增量融合成功！词条: %s 更新完毕。", wiki.Name)

	// 通知前端刷新
	global.SSEBus.Publish("wiki_compiled")

	return nil
}

// MergeWikiContentBackground 在后台利用 LLM 将被合并词条的内容融合进目标词条
func MergeWikiContentBackground(targetID uint, sourceName, sourceContent string) {
	// 如果源词条没有正文内容，跳过 LLM 融合，避免浪费 token
	if sourceContent == "" {
		log.Printf("[词条合并] 源词条 '%s' 无正文内容，跳过 LLM 融合。", sourceName)
		return
	}

	log.Printf("[词条合并] 后台启动对目标词条 %d 的正文重新融合 (来自: %s)...", targetID, sourceName)
	
	var targetWiki models.WikiEntity
	if err := global.DB.First(&targetWiki, targetID).Error; err != nil {
		log.Printf("[词条合并] 找不到目标词条 %d: %v", targetID, err)
		return
	}

	systemPrompt := `你是一个专业且精密的知识百科维护者（Wiki Editor）。
系统目前刚执行了词条合并操作。被弃用的旧词条【` + sourceName + `】已被并入主词条【` + targetWiki.Name + `】中。

你的任务是：仔细阅读这两个词条的原始内容，提取旧词条中有价值的、能够补充主词条的信息，将它们**无缝扩写、插入或修补**到主词条的结构中。

【操作守则】
1. **绝对不要破坏现存的 Markdown 结构**：必须保留标准百科的 5 大标题模块。
2. **严丝合缝地融合**：把两份知识消化后自然地融为一体，不要在段落结尾生硬地写“新补充：”。
3. **消除冗余**：如果两者内容高度重合，请去重并保留表述更好的一方。
4. **价值过滤**：如果旧词条的某些内容毫无价值，可以舍弃。
5. **无增量即免写**：如果旧词条完全没有提供任何新知识（例如它的内容已经全部包含在主词条中，或者是无关紧要的杂谈），你不需要重写整篇词条，只需设置 "no_change": true。

【主词条当前内容】
` + targetWiki.Content + `

【将被合并的旧词条内容】
` + sourceContent + "\n" + jsonOutputPromptWithNoChange
	messages := []map[string]string{
		{"role": "user", "content": "请执行合并融合动作。"},
	}

	resp, err := pkg.AskAI(messages, systemPrompt)
	if err != nil {
		log.Printf("[词条合并] LLM 错误: %v", err)
		return
	}

	var extract struct {
		NoChange bool   `json:"no_change"`
		Summary  string `json:"summary"`
		Content  string `json:"content"`
	}

	if err := pkg.ParseSmartJSON(resp, &extract); err != nil {
		log.Printf("[词条合并] JSON 解析失败: %v, resp: %s", err, resp)
		return
	}

	if extract.NoChange {
		log.Printf("[词条合并] 判定为无增量价值，[%s] 保持原样不重写。", targetWiki.Name)
		return
	}

	if err := global.DB.Model(&targetWiki).Updates(map[string]interface{}{
		"summary": extract.Summary,
		"content": extract.Content,
	}).Error; err != nil {
		log.Printf("[词条合并] 更新目标词条失败: %v", err)
		return
	}

	log.Printf("[词条合并] 大圆满！[%s] 已成功吸纳 [%s] 的营养并完成了重新排版。", targetWiki.Name, sourceName)
	global.SSEBus.Publish("wiki_compiled")
}
