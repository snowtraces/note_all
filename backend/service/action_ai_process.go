package service

import (
	"context"
	"fmt"
	"log"
	"strings"

	"note_all_backend/pkg"
)

// AIProcessActionHandler AI 处理动作处理器
type AIProcessActionHandler struct{}

func init() {
	RegisterActionHandler("ai_process", &AIProcessActionHandler{})
}

// Execute 使用 LLM 处理输入内容
// config 中需包含 "prompt" 字段，prompt 中 {{input}} 会被替换为实际输入
func (h *AIProcessActionHandler) Execute(ctx context.Context, input string, config map[string]interface{}) (string, error) {
	promptTemplate, _ := config["prompt"].(string)
	if promptTemplate == "" {
		promptTemplate = "请分析以下内容并给出总结：\n{{input}}"
	}

	// 输入截断保护：限制 LLM 输入最大字符数，防止超出 token 窗口
	const maxInputChars = 30_000
	if len(input) > maxInputChars {
		input = input[:maxInputChars] + "\n\n...(内容过长，已截断)"
		log.Printf("[AIProcessAction] 输入内容过长，已截断至 %d 字符", maxInputChars)
	}

	// 替换占位符
	prompt := strings.ReplaceAll(promptTemplate, "{{input}}", input)

	log.Printf("[AIProcessAction] 调用 LLM，提示词长度: %d, 输入长度: %d", len(promptTemplate), len(input))

	// 调用 LLM
	messages := []map[string]string{
		{"role": "user", "content": prompt},
	}
	systemPrompt := "你是一个专业的信息分析助手。请根据用户提供的提示词认真处理输入内容，给出高质量的输出。使用 Markdown 格式回答。"

	output, err := pkg.AskAI(messages, systemPrompt)
	if err != nil {
		return "", fmt.Errorf("LLM 调用失败: %v", err)
	}

	if output == "" {
		return "", fmt.Errorf("LLM 返回空结果")
	}

	log.Printf("[AIProcessAction] LLM 返回成功，输出长度: %d", len(output))
	return output, nil
}
