package service

import (
	"fmt"

	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"note_all_backend/pkg"
)

// MemoryManager 负责管理 Agent 的持久化记忆
type MemoryManager struct {
	basePath string
	soul     string
	profile  string
	mu       sync.RWMutex
}

var (
	defaultMemoryManager *MemoryManager
	onceMemory           sync.Once
)

// GetMemoryManager 获取单例
func GetMemoryManager() *MemoryManager {
	onceMemory.Do(func() {
		// 默认路径在 storage_data/agent
		basePath := "storage_data/agent"
		if _, err := os.Stat(basePath); os.IsNotExist(err) {
			_ = os.MkdirAll(basePath, 0755)
		}
		defaultMemoryManager = &MemoryManager{
			basePath: basePath,
		}
		defaultMemoryManager.Load()
	})
	return defaultMemoryManager
}

// Load 加载记忆文件
func (m *MemoryManager) Load() {
	m.mu.Lock()
	defer m.mu.Unlock()

	soulPath := filepath.Join(m.basePath, "soul.md")
	soulData, err := os.ReadFile(soulPath)
	if err == nil {
		m.soul = string(soulData)
	} else {
		log.Printf("[Memory] 警告: 无法读取 soul.md: %v", err)
	}

	profilePath := filepath.Join(m.basePath, "user_profile.md")
	profileData, err := os.ReadFile(profilePath)
	if err == nil {
		m.profile = string(profileData)
	} else {
		log.Printf("[Memory] 警告: 无法读取 user_profile.md: %v", err)
	}
}

// GetSoul 获取灵魂设定
func (m *MemoryManager) GetSoul() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.soul
}

// GetUserProfile 获取用户画像
func (m *MemoryManager) GetUserProfile() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.profile
}

// UpdateUserProfile 更新用户画像（全量覆盖）
func (m *MemoryManager) UpdateUserProfile(content string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	profilePath := filepath.Join(m.basePath, "user_profile.md")
	err := os.WriteFile(profilePath, []byte(content), 0644)
	if err == nil {
		m.profile = content
	}
	return err
}

// GetMemoryPrompt 构建包含身份设定和用户偏好的提示词
func (m *MemoryManager) GetMemoryPrompt() string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var sb strings.Builder
	sb.WriteString("=== AGENT IDENTITY & CORE VALUES ===\n")
	if m.soul != "" {
		sb.WriteString(m.soul)
	} else {
		sb.WriteString("You are NAIA, a helpful AI assistant.")
	}
	sb.WriteString("\n\n=== USER PROFILE & ESTABLISHED PREFERENCES ===\n")
	if m.profile != "" {
		sb.WriteString(m.profile)
	} else {
		sb.WriteString("New user. No established preferences.")
	}
	sb.WriteString("\n")

	return sb.String()
}

// ReflectOnConversation 分析对话并更新用户画像 (异步调用)
func (m *MemoryManager) ReflectOnConversation(messages []ConversationMessage) {
	if len(messages) < 2 {
		return
	}

	log.Printf("[Memory] 开始对对话进行反思与学习...")

	// 构建反思用的上下文
	var history strings.Builder
	for _, msg := range messages {
		// 忽略 system 消息，关注用户和助手的互动
		if msg.Role == "system" {
			continue
		}
		history.WriteString(fmt.Sprintf("[%s]: %s\n", msg.Role, msg.Content))
	}

	prompt := fmt.Sprintf(`作为知识架构师，请深度分析以下对话，提取用户展现出的新偏好、习惯、长期关注领域或特定的交流约束。
然后，将这些新洞察整合到现有的用户画像中。

现有用户画像内容：
---
%s
---

最近对话历史：
---
%s
---

要求：
1. 直接输出更新后的完整 Markdown 格式的用户画像。
2. 保持原有的标题结构（## Identity, ## Active Interests 等）。
3. 仅增加真实且有价值的新发现。
4. 不要包含任何开场白、解释或 Markdown 代码块包裹符号。
5. 必须是纯粹的 Markdown 文本。`, m.GetUserProfile(), history.String())

	// 异步执行，不阻塞主对话流
	go func() {
		// 提取摘要和标签
		updatedProfile, err := pkg.AskAI([]map[string]string{
			{"role": "user", "content": prompt},
		}, "你是一个专业的个人知识管理专家，擅长从对话中提炼用户画像。")

		if err != nil {
			log.Printf("[Memory] 反思调用 LLM 失败: %v", err)
			return
		}

		// 简单的有效性检查：必须包含 Markdown 标题
		if strings.Contains(updatedProfile, "#") {
			if err := m.UpdateUserProfile(updatedProfile); err != nil {
				log.Printf("[Memory] 更新用户画像失败: %v", err)
			} else {
				log.Printf("[Memory] 用户画像已基于最新对话完成自我进化。")
			}
		} else {
			log.Printf("[Memory] LLM 返回内容疑似无效，跳过更新。")
		}
	}()
}
