package pkg

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"note_all_backend/global"
)

// ExtractTextFromImage 调用 AI Studio 的 PaddleOCR 模型接口将图片转译成全量 Markdown 文本
func ExtractTextFromImage(fileBytes []byte, fileExt string) (string, error) {
	// 1. 将文件转为 ASCII Decode 的 Base64
	base64Data := base64.StdEncoding.EncodeToString(fileBytes)

	// 2. 判断文件格式 PDF(0) 或 图片(1)
	fileType := 1
	if strings.ToLower(fileExt) == ".pdf" {
		fileType = 0
	}

	// 3. 构建 Json 请求体
	payload := map[string]interface{}{
		"file":                      base64Data,
		"fileType":                  fileType,
		"useDocOrientationClassify": false,
		"useDocUnwarping":           false,
		"useChartRecognition":       false,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("构建 JSON payload 失败: %v", err)
	}

	// 4. 构建并发送 HTTP Http Client
	req, err := http.NewRequest("POST", global.Config.PaddleApiUrl, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", fmt.Errorf("构建 Http POST 请求失败: %v", err)
	}
	req.Header.Set("Authorization", fmt.Sprintf("token %s", global.Config.PaddleToken))
	req.Header.Set("Content-Type", "application/json")

	// OCR 分析可能比较耗时，这里设定 60 秒的极长超时
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求 Paddle API 报错: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Paddle API HTTP状态码异常: %d", resp.StatusCode)
	}

	// 5. 解析返回值 {"result": { "layoutParsingResults": [ { "markdown": { "text": "..." } } ] }}
	var resData struct {
		Result struct {
			LayoutParsingResults []struct {
				Markdown struct {
					Text string `json:"text"`
				} `json:"markdown"`
			} `json:"layoutParsingResults"`
		} `json:"result"`
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %v", err)
	}

	if err := json.Unmarshal(bodyBytes, &resData); err != nil {
		return "", fmt.Errorf("反序列化 json 失败: %v", err)
	}

	// 6. 将所拆分出来的分页 markdown 组合为一份大长文返回给数据库检索
	var stringBuilder strings.Builder
	for _, layout := range resData.Result.LayoutParsingResults {
		stringBuilder.WriteString(layout.Markdown.Text)
		stringBuilder.WriteString("\n\n")
	}

	resultText := stringBuilder.String()
	// 使用正则移除带有属性的 <div ...><img ... /></div> 结构，避免结果文本中包含过多的无意义图片标签
	re := regexp.MustCompile(`(?i)<div[^>]*>\s*<img[^>]*>\s*</div>`)
	resultText = re.ReplaceAllString(resultText, "")

	return strings.TrimSpace(resultText), nil
}
