package service

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg"

	"gorm.io/gorm"
)

// 会话管理参数
const (
	MaxKeepTurns    = 4   // 保留最近 4 轮对话
	SummaryMaxChars = 500 // 摘要最大字数
)

// SessionManager 会话管理器
type SessionManager struct{}

// ConversationSession 内存中的会话结构
type ConversationSession struct {
	ID          uint
	Title       string
	Messages    []ConversationMessage
	Context     *SessionContext
	CreatedAt   time.Time
}

// SessionContext 会话上下文
type SessionContext struct {
	ActiveDocuments []uint   // 当前讨论的文档 ID
	ActiveTopic     string   // 当前话题关键词
	LastIntent      string   // 上轮意图
	ConfirmedTools  []string // 本 Session 已授权直接放行的高风险工具
}

// ConversationMessage 内存中的消息结构
type ConversationMessage struct {
	Role       string    // user / assistant / system
	Content    string
	References []uint    // 引用的文档 ID
	Intent     string    // 该轮意图
	Timestamp  time.Time
}

// NewSessionManager 创建会话管理器
func NewSessionManager() *SessionManager {
	return &SessionManager{}
}

// LoadSession 加载历史会话（带压缩）
func (sm *SessionManager) LoadSession(sessionID uint) (*ConversationSession, error) {
	if sessionID == 0 {
		// 新会话
		return &ConversationSession{
			ID:        0,
			Messages:  []ConversationMessage{},
			Context:   &SessionContext{},
			CreatedAt: time.Now(),
		}, nil
	}

	// 从数据库加载会话
	var session models.ChatSession
	if err := global.DB.First(&session, sessionID).Error; err != nil {
		return nil, fmt.Errorf("会话不存在: %v", err)
	}

	// 加载消息历史（批量预加载引用，避免 N+1）
	var dbMessages []models.ChatMessage
	if err := global.DB.Preload("References").
		Where("chat_session_id = ?", sessionID).
		Order("id ASC").
		Find(&dbMessages).Error; err != nil {
		return nil, fmt.Errorf("加载消息失败: %v", err)
	}

	// 转换为内存结构
	messages := make([]ConversationMessage, 0, len(dbMessages))
	for _, msg := range dbMessages {
		var refIDs []uint
		if msg.Intent == "" {
			msg.Intent = "unknown"
		}
		// 从预加载的 References 中提取 ID
		for _, ref := range msg.References {
			refIDs = append(refIDs, ref.ID)
		}

		messages = append(messages, ConversationMessage{
			Role:       msg.Role,
			Content:    msg.Content,
			References: refIDs,
			Intent:     msg.Intent,
			Timestamp:  msg.CreatedAt,
		})
	}

	// 解析上下文
	context := &SessionContext{}
	if session.ActiveDocs != "" {
		json.Unmarshal([]byte(session.ActiveDocs), &context.ActiveDocuments)
	}
	context.ActiveTopic = session.ActiveTopic

	// 从 LastIntent 解析 ConfirmedTools 字段
	if strings.Contains(session.LastIntent, "|confirmed:") {
		parts := strings.Split(session.LastIntent, "|confirmed:")
		context.LastIntent = parts[0]
		if len(parts) > 1 && parts[1] != "" {
			context.ConfirmedTools = strings.Split(parts[1], ",")
		}
	} else {
		context.LastIntent = session.LastIntent
	}

	// 如果有压缩摘要，作为第一条消息
	if session.ContextSummary != "" && len(messages) > 0 {
		summaryMsg := ConversationMessage{
			Role:      "system",
			Content:   "【历史对话摘要】" + session.ContextSummary,
			Timestamp: messages[0].Timestamp,
		}
		messages = append([]ConversationMessage{summaryMsg}, messages...)
	}

	// 压缩历史（如果超过阈值）
	sm.compressIfNeeded(len(messages))

	convSession := &ConversationSession{
		ID:        sessionID,
		Title:     session.Title,
		Messages:  messages,
		Context:   context,
		CreatedAt: session.CreatedAt,
	}

	log.Printf("[SessionManager] 加载会话 %d: %d 条消息, %d 个关注文档",
		sessionID, len(messages), len(context.ActiveDocuments))

	return convSession, nil
}

// SaveTurn 保存单轮对话
func (sm *SessionManager) SaveTurn(sessionID uint, msg ConversationMessage) (uint, error) {
	// 如果是新会话，先创建
	if sessionID == 0 {
		title := msg.Content
		if len([]rune(title)) > 30 {
			title = string([]rune(title)[:30]) + "..."
		}
		session := models.ChatSession{
			Title: title,
		}
		if err := global.DB.Create(&session).Error; err != nil {
			return 0, fmt.Errorf("创建会话失败: %v", err)
		}
		sessionID = session.ID
	}

	// 创建消息记录
	dbMsg := models.ChatMessage{
		ChatSessionID: sessionID,
		Role:          msg.Role,
		Content:       msg.Content,
		Intent:        msg.Intent,
		CreatedAt:     msg.Timestamp,
	}
	if dbMsg.CreatedAt.IsZero() {
		dbMsg.CreatedAt = time.Now()
	}

	if err := global.DB.Create(&dbMsg).Error; err != nil {
		return sessionID, fmt.Errorf("保存消息失败: %v", err)
	}

	// 保存引用文档
	if len(msg.References) > 0 && msg.Role == "assistant" {
		var refs []models.NoteItem
		global.DB.Where("id IN ?", msg.References).Find(&refs)
		global.DB.Model(&dbMsg).Association("References").Replace(refs)
	}

	log.Printf("[SessionManager] 保存消息: session=%d, role=%s, intent=%s",
		sessionID, msg.Role, msg.Intent)

	return sessionID, nil
}

// UpdateContext 更新会话上下文
func (sm *SessionManager) UpdateContext(sessionID uint, context *SessionContext) error {
	if sessionID == 0 {
		return nil
	}

	activeDocsJSON, _ := json.Marshal(context.ActiveDocuments)

	// 把 ConfirmedTools 拼入 LastIntent 存储以节省数据库字段修改
	lastIntentSaved := context.LastIntent
	if len(context.ConfirmedTools) > 0 {
		lastIntentSaved = fmt.Sprintf("%s|confirmed:%s", context.LastIntent, strings.Join(context.ConfirmedTools, ","))
	}

	return global.DB.Model(&models.ChatSession{}).
		Where("id = ?", sessionID).
		Updates(map[string]interface{}{
			"active_docs":  string(activeDocsJSON),
			"active_topic": context.ActiveTopic,
			"last_intent":  lastIntentSaved,
		}).Error
}

// CompressHistory 压缩长对话历史（增强版：恢复工作语义）
func (sm *SessionManager) CompressHistory(sessionID uint) error {
	if sessionID == 0 {
		return nil
	}

	// 统计消息数量
	var count int64
	global.DB.Model(&models.ChatMessage{}).
		Where("chat_session_id = ?", sessionID).
		Count(&count)

	if count <= MaxKeepTurns*2 {
		return nil // 无需压缩
	}

	// 获取早期消息（保留最近 8 条，压缩前面的），预加载 References 避免 N+1
	keepCount := MaxKeepTurns * 2
	var earlyMessages []models.ChatMessage
	global.DB.Preload("References").
		Where("chat_session_id = ?", sessionID).
		Order("id ASC").
		Limit(int(count) - keepCount).
		Find(&earlyMessages)

	if len(earlyMessages) == 0 {
		return nil
	}

	// 获取当前会话上下文（用于恢复工作语义）
	var session models.ChatSession
	global.DB.First(&session, sessionID)

	// 提取工作语义（从最后几条消息）
	workSemantic := sm.extractWorkSemantic(earlyMessages)

	// 生成摘要（包含工作语义）
	summary := sm.generateSummaryWithWorkSemantic(earlyMessages, workSemantic)

	// 更新会话摘要
	if err := global.DB.Model(&models.ChatSession{}).
		Where("id = ?", sessionID).
		Update("context_summary", summary).Error; err != nil {
		return err
	}

	// 删除早期消息及其引用关系
	for _, msg := range earlyMessages {
		global.DB.Model(&msg).Association("References").Clear()
		global.DB.Delete(&msg)
	}

	log.Printf("[SessionManager] 压缩会话 %d: 删除 %d 条早期消息, 恢复工作语义: docs=%d, topic=%s",
		sessionID, len(earlyMessages), len(workSemantic.ActiveDocs), workSemantic.ActiveTopic)

	return nil
}

// WorkSemantic 工作语义（压缩后需恢复）
type WorkSemantic struct {
	ActiveDocs   []uint // 活跃文档 ID
	ActiveTopic  string // 活跃话题
	LastIntent   string // 上轮意图
	KeyFindings  string // 关键发现
}

// extractWorkSemantic 从消息中提取工作语义
func (sm *SessionManager) extractWorkSemantic(messages []models.ChatMessage) WorkSemantic {
	semantic := WorkSemantic{
		ActiveDocs:  []uint{},
		ActiveTopic: "",
		LastIntent:  "",
		KeyFindings: "",
	}

	// 从最后一条 assistant 消息提取意图
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role == "assistant" && messages[i].Intent != "" {
			semantic.LastIntent = messages[i].Intent
			break
		}
	}

	// 从消息引用中提取活跃文档（使用已预加载的 References）
	for i := len(messages) - 1; i >= 0; i-- {
		// References 已在 CompressHistory 中预加载
		for _, ref := range messages[i].References {
			if !containsUintSlice(semantic.ActiveDocs, ref.ID) {
				semantic.ActiveDocs = append(semantic.ActiveDocs, ref.ID)
				if len(semantic.ActiveDocs) >= 5 {
					break
				}
			}
		}
		if len(semantic.ActiveDocs) >= 5 {
			break
		}
	}

	// 从最后一条用户消息提取话题关键词（简化版）
	if len(messages) > 0 {
		lastUserMsg := ""
		for i := len(messages) - 1; i >= 0; i-- {
			if messages[i].Role == "user" {
				lastUserMsg = messages[i].Content
				break
			}
		}
		if len(lastUserMsg) > 30 {
			semantic.ActiveTopic = lastUserMsg[:30]
		} else {
			semantic.ActiveTopic = lastUserMsg
		}
	}

	return semantic
}

// generateSummaryWithWorkSemantic 生成包含工作语义的摘要
func (sm *SessionManager) generateSummaryWithWorkSemantic(messages []models.ChatMessage, semantic WorkSemantic) string {
	// 构建 Prompt
	prompt := "请将以下对话历史压缩为一段简短摘要。要求：\n"
	prompt += "1. 保留关键讨论话题\n"
	prompt += "2. 保留涉及的文档 ID\n"
	prompt += "3. 提炼关键结论或发现\n"
	prompt += "4. 不超过 500 字\n\n"

	for _, msg := range messages {
		prompt += fmt.Sprintf("[%s]: %s\n", msg.Role, msg.Content)
		if len(msg.Intent) > 0 {
			prompt += fmt.Sprintf("  意图: %s\n", msg.Intent)
		}
	}

	// 添加工作语义说明
	if len(semantic.ActiveDocs) > 0 {
		prompt += fmt.Sprintf("\n当前活跃文档: %v\n", semantic.ActiveDocs)
	}
	if semantic.ActiveTopic != "" {
		prompt += fmt.Sprintf("当前话题: %s\n", semantic.ActiveTopic)
	}

	prompt += "\n输出格式：讨论了X、Y话题，主要涉及文档[ID列表]，关键结论：..."

	// 调用 LLM
	summary, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": prompt},
	}, "你是一个对话摘要助手，擅长精炼总结对话要点。")

	if err != nil {
		log.Printf("[SessionManager] 摘要生成失败: %v", err)
		// 降级：直接拼接工作语义
		summary = fmt.Sprintf("历史对话摘要：涉及文档 %v，话题：%s", semantic.ActiveDocs, semantic.ActiveTopic)
	}

	if len(summary) > SummaryMaxChars {
		summary = summary[:SummaryMaxChars] + "..."
	}

	// 添加工作语义标记（便于恢复）
	summary += fmt.Sprintf("\n[工作语义] 活跃文档:%v 话题:%s 意图:%s",
		semantic.ActiveDocs, semantic.ActiveTopic, semantic.LastIntent)

	return summary
}

// containsUintSlice 检查切片是否包含指定元素（session.go 专用）
func containsUintSlice(slice []uint, item uint) bool {
	for _, v := range slice {
		if v == item {
			return true
		}
	}
	return false
}

// compressIfNeeded 内部压缩检查
func (sm *SessionManager) compressIfNeeded(msgCount int) {
	// 仅在内存中处理，实际压缩由 CompressHistory 执行
	// 这里只是估算，不执行实际压缩
}

// generateSummary 生成对话摘要
func (sm *SessionManager) generateSummary(messages []models.ChatMessage) string {
	// 构建 Prompt
	prompt := "请将以下对话历史压缩为一段简短摘要（保留关键讨论话题和涉及的文档ID）：\n\n"
	for _, msg := range messages {
		prompt += fmt.Sprintf("[%s]: %s\n", msg.Role, msg.Content)
		if len(msg.Intent) > 0 {
			prompt += fmt.Sprintf("  意图: %s\n", msg.Intent)
		}
	}

	prompt += "\n输出格式（不超过500字）：讨论了X、Y话题，主要涉及文档[ID列表]，关键结论：..."

	// 调用 LLM
	summary, err := pkg.AskAI([]map[string]string{
		{"role": "user", "content": prompt},
	}, "你是一个对话摘要助手，擅长精炼总结对话要点。")

	if err != nil {
		log.Printf("[SessionManager] 摘要生成失败: %v", err)
		return "历史对话摘要生成失败"
	}

	if len(summary) > SummaryMaxChars {
		summary = summary[:SummaryMaxChars] + "..."
	}

	return summary
}

// GetRecentSessions 获取最近会话列表
func (sm *SessionManager) GetRecentSessions(limit int) ([]models.ChatSession, error) {
	var sessions []models.ChatSession
	err := global.DB.Order("id DESC").Limit(limit).Find(&sessions).Error
	return sessions, err
}

// DeleteSession 删除会话
func (sm *SessionManager) DeleteSession(sessionID uint) error {
	return global.DB.Transaction(func(tx *gorm.DB) error {
		// 清理消息引用
		var messages []models.ChatMessage
		if err := tx.Where("chat_session_id = ?", sessionID).Find(&messages).Error; err != nil {
			return err
		}
		for _, msg := range messages {
			if err := tx.Model(&msg).Association("References").Clear(); err != nil {
				return err
			}
		}

		// 删除消息
		if err := tx.Where("chat_session_id = ?", sessionID).Delete(&models.ChatMessage{}).Error; err != nil {
			return err
		}

		// 删除会话
		if err := tx.Unscoped().Delete(&models.ChatSession{}, sessionID).Error; err != nil {
			return err
		}

		return nil
	})
}