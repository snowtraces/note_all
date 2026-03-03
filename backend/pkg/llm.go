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
