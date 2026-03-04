package network

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"strings"
	"time"

	"note_all_pc/internal/domain"
)

// UploadFile 将本地图片文件上传到 Note All 服务器
func UploadFile(filePath string, cfg *domain.Config) (*domain.UploadResult, error) {
	// 1. 检查文件是否为图片类型
	ext := strings.ToLower(filepath.Ext(filePath))
	mimeType := mime.TypeByExtension(ext)
	if !strings.HasPrefix(mimeType, "image/") {
		return nil, fmt.Errorf("不支持的文件类型 %q，仅支持图片文件（jpg/png/gif/webp 等）", ext)
	}

	// 2. 打开文件
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("无法打开文件: %w", err)
	}
	defer file.Close()

	// 3. 构造 multipart/form-data 请求体
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	partHeader := make(textproto.MIMEHeader)
	partHeader.Set("Content-Disposition",
		fmt.Sprintf(`form-data; name="file"; filename="%s"`, filepath.Base(filePath)))
	partHeader.Set("Content-Type", mimeType)
	part, err := writer.CreatePart(partHeader)
	if err != nil {
		return nil, fmt.Errorf("构造上传请求失败: %w", err)
	}
	if _, err = io.Copy(part, file); err != nil {
		return nil, fmt.Errorf("读取文件内容失败: %w", err)
	}
	writer.Close()

	// 4. 发送 HTTP POST 请求
	timeout := time.Duration(cfg.UploadTimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	client := &http.Client{Timeout: timeout}

	url := strings.TrimRight(cfg.ServerURL, "/") + "/api/upload"
	req, err := http.NewRequest(http.MethodPost, url, &buf)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("网络请求失败，请确认服务器 %s 已启动: %w", cfg.ServerURL, err)
	}
	defer resp.Body.Close()

	// 5. 解析响应
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("服务器返回错误 %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Message string `json:"message"`
		Data    struct {
			ID uint `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	return &domain.UploadResult{
		NoteID:  fmt.Sprintf("%d", result.Data.ID),
		Message: result.Message,
	}, nil
}

// UploadText 将本地纯文本上传到 Note All 服务器
func UploadText(text string, cfg *domain.Config) (*domain.UploadResult, error) {
	timeout := time.Duration(cfg.UploadTimeoutSec) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	client := &http.Client{Timeout: timeout}

	url := strings.TrimRight(cfg.ServerURL, "/") + "/api/note/text"

	payload := map[string]string{"text": text}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("构造请求失败: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("网络请求失败，请确认服务器 %s 已启动: %w", cfg.ServerURL, err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("服务器返回错误 %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Message string `json:"message"`
		Data    struct {
			ID uint `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	return &domain.UploadResult{
		NoteID:  fmt.Sprintf("%d", result.Data.ID),
		Message: result.Message,
	}, nil
}
