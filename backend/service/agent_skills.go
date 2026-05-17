package service

import (
	"log"
	"sync"
)

// Skill 接口定义了 Agent 的原子能力
type Skill interface {
	Name() string
	Description() string
	Usage() string // 参数说明
	Execute(params map[string]interface{}) (ToolResult, error)
}

// SkillRegistry 技能注册表
type SkillRegistry struct {
	skills map[string]Skill
	mu     sync.RWMutex
}

var (
	defaultSkillRegistry *SkillRegistry
	onceSkill            sync.Once
)

// GetSkillRegistry 获取单例
func GetSkillRegistry() *SkillRegistry {
	onceSkill.Do(func() {
		defaultSkillRegistry = &SkillRegistry{
			skills: make(map[string]Skill),
		}
		// 注册初始技能
		defaultSkillRegistry.registerDefaultSkills()
	})
	return defaultSkillRegistry
}

func (r *SkillRegistry) registerDefaultSkills() {
	// 这里未来会将 tools.go 中的逻辑封装为 Skill 对象
	// 暂时保留，先实现框架
}

// Register 注册新技能
func (r *SkillRegistry) Register(skill Skill) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.skills[skill.Name()] = skill
	log.Printf("[SkillRegistry] 注册技能: %s (%s)", skill.Name(), skill.Description())
}

// Get 获取技能
func (r *SkillRegistry) Get(name string) (Skill, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.skills[name]
	return s, ok
}

// List 列表所有可用技能
func (r *SkillRegistry) List() []Skill {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]Skill, 0, len(r.skills))
	for _, s := range r.skills {
		list = append(list, s)
	}
	return list
}

// ==================== 示例技能：冲突检测 (Conflict Skill) ====================

type ConflictSkill struct{}

func (s *ConflictSkill) Name() string        { return "conflict_check" }
func (s *ConflictSkill) Description() string { return "检测笔记之间是否存在矛盾或冲突的信息" }
func (s *ConflictSkill) Usage() string       { return "{\"doc_ids\": [1, 2, 3]}" }

func (s *ConflictSkill) Execute(params map[string]interface{}) (ToolResult, error) {
	// 这里可以复用 ToolExecutor 的逻辑或直接实现
	return ToolResult{
		Output: "检测完成：未发现明显的逻辑冲突。",
	}, nil
}

// ==================== 包装现有的 ToolExecutor 为 Skill 体系 ====================

// BaseSkill 包装器，用于将旧的 Tool 调用桥接到新体系
type LegacyToolSkill struct {
	toolName Tool
	executor *ToolExecutor
}

func (s *LegacyToolSkill) Name() string { return string(s.toolName) }
func (s *LegacyToolSkill) Description() string {
	switch s.toolName {
	case ToolSearch:
		return "在知识库中搜索相关文档"
	case ToolSummarize:
		return "对指定文档进行摘要和提炼"
	case ToolCompare:
		return "对比多个文档的异同点"
	case ToolGenerate:
		return "基于参考内容生成新的报告或文本"
	case ToolAnalyze:
		return "分析文档间的关联关系"
	case ToolSaveNote:
		return "将当前对话的总结或指定内容保存为永久笔记"
	}
	return "基础能力工具"
}
func (s *LegacyToolSkill) Usage() string {
	switch s.toolName {
	case ToolSearch:
		return "{\"query\": \"关键词\"}"
	case ToolSummarize:
		return "{\"documents\": [1, 2]}"
	case ToolCompare:
		return "{\"documents\": [1, 2]}"
	case ToolGenerate:
		return "{\"prompt\": \"生成的指令\", \"documents\": [1]}"
	case ToolAnalyze:
		return "{\"doc_id\": 1}"
	case ToolSaveNote:
		return "{\"title\": \"笔记标题\", \"content\": \"笔记内容\", \"tags\": \"标签1,标签2\"}"
	}
	return "{}"
}

func (s *LegacyToolSkill) Execute(params map[string]interface{}) (ToolResult, error) {
	result := s.executor.Execute(ToolCall{
		Tool:       s.toolName,
		Parameters: params,
	}, nil)
	return result, nil
}

func (r *SkillRegistry) registerLegacySkills() {
	executor := NewToolExecutor()
	tools := []Tool{ToolSearch, ToolSummarize, ToolCompare, ToolGenerate, ToolAnalyze, ToolSaveNote}
	for _, t := range tools {
		r.Register(&LegacyToolSkill{toolName: t, executor: executor})
	}
}

// InitSkills 初始化所有技能
func InitSkills() {
	registry := GetSkillRegistry()
	registry.registerLegacySkills()
	registry.Register(&ConflictSkill{})
}
