package pkg

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"

	"note_all_backend/global"
)

// ExtractSummaryAndTags 是一套专用于清洗和归纳 OCR 碎片文本（大模型提炼师）的功能
// 会强求大模型按标准 JSON 的格式返回以方便结构化持久落库
func ExtractSummaryAndTags(ocrContent string) (summary string, tags string, err error) {
	if len(ocrContent) == 0 {
		return "", "", fmt.Errorf("OCR文本为空，无需提取摘要")
	}

	// 1. 构建 System 级大模型提纯要求 (Prompt Engineering)
	// 使用强制 JSON 规范与严格的不多废话指令，保障服务端的健壮反序列化。
	systemPrompt := "你是一个精干的知识库文本提炼助理。用户会给你一段从图片/截图中OCR扫描出来的杂乱文字。\n" +
		"请你做两件事：\n" +
		"1. 用不超过50个字的简练句子概括核心内容。\n" +
		"2. 提取最具有分类意义的1-5个词语作为标签(Tags)，使用中英半角逗号分隔。\n\n" +
		"你必须严格只输出以下格式的JSON内容，不允许有任何额外的Markdown包裹（譬如无需带有反引号的代码块标识）和闲聊句子：\n" +
		`{"summary":"你的概括结论","tags":"标签1,标签2,标签3"}`

	// 2. 组装符合 OpenAI 规范的请求体
	payload := map[string]interface{}{
		"model": global.Config.LlmModelID,
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": systemPrompt,
			},
			{
				"role":    "user",
				"content": ocrContent,
			},
		},
		"stream":                false, // 对于程序化的结构数据处理，关闭流式以直接拿结构化终态
		"temperature":           0.8,
		"top_p":                 0.8,
		"max_completion_tokens": 8000,
		"frequency_penalty":     0,
		"presence_penalty":      0,
		"penalty_score":         1,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", "", fmt.Errorf("构建 LLM JSON payload 失败: %v", err)
	}

	req, err := http.NewRequest("POST", global.Config.LlmApiUrl, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", "", fmt.Errorf("构建 LLM POST 请求失败: %v", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", global.Config.LlmApiToken))
	req.Header.Set("Content-Type", "application/json")

	// 模型需要时间响应，预留 120 秒长超时以防偶尔的网络延迟与分析耗时
	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("请求 ERNIE 模型 API 报错: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", "", fmt.Errorf("ERNIE API HTTP 状态码异常: %d, Message: %s", resp.StatusCode, string(body))
	}

	// 3. 解析 OpenAI 风格的结果体
	var resData struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", fmt.Errorf("读取响应失败: %v", err)
	}

	if err := json.Unmarshal(bodyBytes, &resData); err != nil {
		return "", "", fmt.Errorf("反序列化 LLM 响应 json 失败: %v", err)
	}

	if len(resData.Choices) == 0 {
		return "", "", fmt.Errorf("大模型没有返回有效的提炼结果")
	}

	content := resData.Choices[0].Message.Content

	// 4. 解析大模型返回的约束 JSON 进行解构
	var extract struct {
		Summary string `json:"summary"`
		Tags    string `json:"tags"`
	}

	err = json.Unmarshal([]byte(content), &extract)
	if err != nil {
		// 容错策略：大语模型有时还是会吐出带有 ```json 的 Markdown 包裹，使用正则强行拽出中间的 JSON 实体
		re := regexp.MustCompile(`(?s)\{.*\}`)
		cleanJSON := re.FindString(content)
		if cleanJSON == "" {
			return content, "ai-fail", fmt.Errorf("模型未严格返回 JSON, parser err: %v 原文: %s", err, content)
		}

		if errRetry := json.Unmarshal([]byte(cleanJSON), &extract); errRetry != nil {
			return content, "ai-fail", fmt.Errorf("正则清洗后仍无法解析 JSON: %v", errRetry)
		}
	}

	return extract.Summary, extract.Tags, nil
}

// AskAIWithContext 根据提供的上下文（相关笔记片段）与多轮对话列表，回答用户的问题
func AskAIWithContext(messages []map[string]string, contextStr string) (string, error) {
	fmt.Printf("[AskAI] Context length: %d\n", len(contextStr))

	systemPrompt := "你是一个专注于个人知识库的智能助手，同时具备深厚的通用知识储备。你会优先基于【参考笔记上下文】来回答用户的问题，以体现出你对用户个人资料的了解；如果数据中没有直接答案，请结合由于你作为大模型本身的通用智慧来流畅地回答，无需由于缺乏引用而反复道歉。请用简洁、深刻的口吻进行回复，并支持 Markdown 格式排版。\n\n"
	if contextStr != "" {
		systemPrompt += "【参考笔记上下文】开始：\n" + contextStr + "\n【参考笔记上下文】结束"
	} else {
		systemPrompt += "（当前没有找到与问题直接相关的笔记碎片记录）"
	}

	finalMessages := []map[string]string{
		{
			"role":    "system",
			"content": systemPrompt,
		},
	}
	finalMessages = append(finalMessages, messages...)

	payload := map[string]interface{}{
		"model":                 global.Config.LlmModelID,
		"messages":              finalMessages,
		"stream":                false,
		"temperature":           0.7,
		"top_p":                 0.8,
		"max_completion_tokens": 4000,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("构建 LLM JSON payload 失败: %v", err)
	}

	req, err := http.NewRequest("POST", global.Config.LlmApiUrl, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", fmt.Errorf("构建 LLM POST 请求失败: %v", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", global.Config.LlmApiToken))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求 ERNIE 模型 API 报错: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ERNIE API HTTP 状态码异常: %d, Message: %s", resp.StatusCode, string(body))
	}

	var resData struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %v", err)
	}

	if err := json.Unmarshal(bodyBytes, &resData); err != nil {
		return "", fmt.Errorf("反序列化 LLM 响应 json 失败: %v", err)
	}

	if len(resData.Choices) == 0 {
		return "", fmt.Errorf("大模型没有返回有效的提炼结果")
	}

	return resData.Choices[0].Message.Content, nil
}
