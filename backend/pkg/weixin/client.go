package weixin

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

const (
	DefaultBaseURL = "https://ilinkai.weixin.qq.com"
	ChannelVersion = "1.0.0"
)

// WechatClient 微信 Bot 协议 HTTP 客户端封装
type WechatClient struct {
	BaseURL    string
	BotToken   string
	HttpClient *http.Client
}

// BaseInfo 协议要求的公共基础信息结构
type BaseInfo struct {
	ChannelVersion string `json:"channel_version"`
}

// RequestBody 协议通用的请求 Body 结构
type RequestBody struct {
	BaseInfo BaseInfo               `json:"base_info"`
	Extra    map[string]interface{} `json:"-"` // 用于灵活扩展各接口字段
}

// NewWechatClient 创建新的客户端
func NewWechatClient(baseURL, token string) *WechatClient {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	return &WechatClient{
		BaseURL:    baseURL,
		BotToken:   token,
		HttpClient: &http.Client{Timeout: 45 * time.Second}, // 考虑到 35s 长轮询
	}
}

// RandomWechatUin 生成 X-WECHAT-UIN 所需的 Base64 字符串
func RandomWechatUin() string {
	var val uint32
	binary.Read(rand.Reader, binary.BigEndian, &val)
	return base64.StdEncoding.EncodeToString([]byte(strconv.FormatUint(uint64(val), 10)))
}

// DoRequest 发送通用的业务请求 (POST + AuthorizationHeaders)
func (c *WechatClient) DoRequest(ctx context.Context, method, path string, body interface{}) ([]byte, error) {
	url := c.BaseURL + path
	
	var bodyReader io.Reader
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(jsonBytes)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, err
	}

	// 注入微信业务请求头
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("AuthorizationType", "ilink_bot_token")
	req.Header.Set("Authorization", "Bearer "+c.BotToken)
	req.Header.Set("X-WECHAT-UIN", RandomWechatUin())
	req.Header.Set("iLink-App-ClientVersion", "1")

	resp, err := c.HttpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http error: %d, body: %s", resp.StatusCode, string(respBytes))
	}

	return respBytes, nil
}

// SendMessage 发送微信消息
func (c *WechatClient) SendMessage(ctx context.Context, toUserID, clientID, contextToken string, items []MessageItem) error {
	body := map[string]interface{}{
		"msg": map[string]interface{}{
			"to_user_id":    toUserID,
			"client_id":     clientID,
			"message_type":  2, // BOT
			"message_state": 2, // FINISH
			"context_token": contextToken,
			"item_list":     items,
		},
		"base_info": BuildBaseInfo(),
	}

	_, err := c.DoRequest(ctx, "POST", "/ilink/bot/sendmessage", body)
	return err
}

func BuildBaseInfo() BaseInfo {
	return BaseInfo{ChannelVersion: ChannelVersion}
}
