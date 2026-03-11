package pkg

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png" // 注册解码器
	"io"
	"net/http"
	"regexp"
	"time"

	"note_all_backend/global"

	"github.com/nfnt/resize"
)

// CompressImage 压缩图片尺寸以降低送往 VLM 的 Token 消耗，若图片较小则原样返回
func CompressImage(imageBytes []byte) ([]byte, error) {
	img, format, err := image.Decode(bytes.NewReader(imageBytes))
	if err != nil {
		return nil, fmt.Errorf("图片解码失败 (可能是非标准格式): %v", err)
	}

	bounds := img.Bounds()
	width := uint(bounds.Dx())
	height := uint(bounds.Dy())

	// 如果尺寸不大，不需要压缩，直接返回原图
	if width <= 512 && height <= 512 {
		return imageBytes, nil
	}

	// 等比例缩小到最大宽高为 512
	var newWidth, newHeight uint
	if width > height {
		newWidth = 512
		newHeight = uint(float64(height) * (512.0 / float64(width)))
	} else {
		newHeight = 512
		newWidth = uint(float64(width) * (512.0 / float64(height)))
	}

	// 选用 Lanczos3 或者 Bilinear 算法
	m := resize.Resize(newWidth, newHeight, img, resize.Bilinear)

	var buf bytes.Buffer
	// 统一压缩成 JPEG, 品质 60 (激进压缩以换取更小的体积)
	err = jpeg.Encode(&buf, m, &jpeg.Options{Quality: 60})
	if err != nil {
		return nil, fmt.Errorf("图片编码压缩失败: %v", err)
	}

	fmt.Printf("[激进压缩完成] 原格式: %s, 尺寸: %dx%d -> 新尺寸: %dx%d, 体积: %d -> %d\n",
		format, width, height, newWidth, newHeight, len(imageBytes), buf.Len())

	return buf.Bytes(), nil
}

// DescribeImageVlm 调用多模态大模型对图像进行深度语义描述，并同步完成摘要提炼和标签提取
func DescribeImageVlm(imageBytes []byte, mimeType string) (string, string, string, error) {
	if len(imageBytes) == 0 {
		return "", "", "", fmt.Errorf("图像内容为空")
	}

	// [优化] 送入 VLM 前进行适当尺寸的压缩，节约 Token 消耗
	compressedBytes, errCompress := CompressImage(imageBytes)
	if errCompress != nil {
		fmt.Printf("[VLM 压缩警告] 图片无法压缩，使用原图。原因: %v\n", errCompress)
		compressedBytes = imageBytes
	} else {
		// 如果成功压缩出了 JPEG，强制让 MIME 伪装为 image/jpeg 以便适配后续协议
		mimeType = "image/jpeg"
	}

	// 1. 将图片转为 Base64
	base64Image := base64.StdEncoding.EncodeToString(compressedBytes)
	imageUrl := fmt.Sprintf("data:%s;base64,%s", mimeType, base64Image)

	// 2. 构建符合 OpenAI 视觉规范的请求
	modelID := global.Config.VlmModelID
	if modelID == "" {
		modelID = global.Config.LlmModelID // 兜底使用普通 LLM ID，如果其本身支持多模态
	}

	payload := map[string]interface{}{
		"model": modelID,
		"messages": []map[string]interface{}{
			{
				"role": "user",
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": "你是一个专业的视觉理解分析助手。请对这张图片进行深度识别与分析：\n" +
							"1. 若图片内包含实质文本内容或排版信息，请将其尽可能完整地提取并梳理出来；\n" +
							"2. 若为自然场景、组件、图表或插画，描述尽可能详细；\n" +
							"3. 请将所有这些详细描述（包括且不限于提取到的正文文字）放入 desc 字段中；\n" +
							"4. 另外提炼出不超过50字的概括结论放入 summary 字段；\n" +
							"5. 提取1到5个最能代表其分类及使用场景的词语放入 tags 字段，使用半角逗号分隔，要包括图片中主语的具体名称。\n\n" +
							"你必须严格只输出以下格式的纯JSON字符串。绝对不要带有任何Markdown的 ```json 包裹符号，不要有任何多余的解释、寒暄或回车：\n" +
							`{"desc":"图片完整的文本提取及视觉描述内容","summary":"简要图片概括(不超过50字)","tags":"标签1,标签2,标签3"}`,
					},
					{
						"type": "image_url",
						"image_url": map[string]string{
							"url": imageUrl,
						},
					},
				},
			},
		},
		"max_completion_tokens": 1500,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", "", "", fmt.Errorf("构建 VLM JSON payload 失败: %v", err)
	}

	req, err := http.NewRequest("POST", global.Config.LlmApiUrl, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", "", "", fmt.Errorf("构建 VLM POST 请求失败: %v", err)
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", global.Config.LlmApiToken))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", "", fmt.Errorf("请求 VLM API 报错: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", "", "", fmt.Errorf("VLM API HTTP 状态码异常: %d, Message: %s", resp.StatusCode, string(body))
	}

	var resData struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&resData); err != nil {
		return "", "", "", fmt.Errorf("反序列化 VLM 响应失败: %v", err)
	}

	if len(resData.Choices) == 0 {
		return "", "", "", fmt.Errorf("VLM 没有返回有效的描述结果")
	}

	content := resData.Choices[0].Message.Content

	var extract struct {
		Desc    string `json:"desc"`
		Summary string `json:"summary"`
		Tags    string `json:"tags"`
	}

	err = json.Unmarshal([]byte(content), &extract)
	if err != nil {
		// 容错策略：尝试使用正则强行拽出中间的 JSON 实体
		re := regexp.MustCompile(`(?s)\{.*\}`)
		cleanJSON := re.FindString(content)
		if cleanJSON == "" {
			return content, "未提取到摘要", "ai-fail", fmt.Errorf("VLM 模型未严格返回 JSON, parser err: %v 原文: %s", err, content)
		}

		if errRetry := json.Unmarshal([]byte(cleanJSON), &extract); errRetry != nil {
			return content, "未提取到摘要", "ai-fail", fmt.Errorf("VLM 正则清洗后仍无法解析 JSON: %v", errRetry)
		}
	}

	return extract.Desc, extract.Summary, extract.Tags, nil
}

// ExtractSummaryAndTags 是一套专用于清洗和归纳 OCR 碎片文本（大模型提炼师）的功能
// 会强求大模型按标准 JSON 的格式返回以方便结构化持久落库
func ExtractSummaryAndTags(ocrContent string, customPrompt string) (summary string, tags string, err error) {
	if len(ocrContent) == 0 {
		return "", "", fmt.Errorf("OCR文本为空，无需提取摘要")
	}

	// 1. 构建 System 级大模型提纯要求 (Prompt Engineering)
	systemPrompt := customPrompt
	if systemPrompt == "" {
		systemPrompt = "你是一个精干的知识库文本提炼助理。用户会给你一段从图片/截图中OCR扫描出来的杂乱文字。\n" +
			"请你做两件事：\n" +
			"1. 用不超过50个字的简练句子概括核心内容（若输入源文本少于50字，摘要直接等同于输入源文本）。\n" +
			"2. 提取最具有分类意义的1-5个词语作为标签(Tags)，使用中英半角逗号分隔。\n\n" +
			"你必须严格只输出以下格式的JSON内容，不允许有任何额外的Markdown包裹（譬如无需带有反引号的代码块标识）和闲聊句子：\n" +
			`{"summary":"你的概括结论","tags":"标签1,标签2,标签3"}`
	}

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
		"max_completion_tokens": 2048,
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
