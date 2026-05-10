package weixin

import (
	"context"
	"encoding/json"
	"fmt"
)

// WeixinMessage 接收到的单条微信消息
type WeixinMessage struct {
	Seq          int64           `json:"seq"`
	MessageID    int64           `json:"message_id"`
	FromUserID   string          `json:"from_user_id"`
	ToUserID     string          `json:"to_user_id"`
	ClientID     string          `json:"client_id"`
	CreateTimeMs int64           `json:"create_time_ms"`
	UpdateTimeMs int64           `json:"update_time_ms"`
	SessionID    string          `json:"session_id"`
	MessageType  int             `json:"message_type"`  // 1=USER, 2=BOT
	MessageState int             `json:"message_state"` // 0=NEW, 1=GENERATING, 2=FINISH
	ContextToken string          `json:"context_token"`
	ItemList     []MessageItem   `json:"item_list"`
}

// MessageItem 消息项内容
type MessageItem struct {
	Type          int        `json:"type"` // 1=TEXT, 2=IMAGE, 3=VOICE, 4=FILE, 5=VIDEO
	TextItem      *Text      `json:"text_item,omitempty"`
	ImageItem     *Image     `json:"image_item,omitempty"`
	VoiceItem     *Voice     `json:"voice_item,omitempty"`
	FileItem      *File      `json:"file_item,omitempty"`
	VideoItem     *Video     `json:"video_item,omitempty"`
}

type Text struct {
	Text string `json:"text"`
}

type Image struct {
	Media      CDNMedia `json:"media"`
	ThumbMedia CDNMedia `json:"thumb_media"`
}

type Voice struct {
	Media      CDNMedia `json:"media"`
	Text       string   `json:"text"`
}

type File struct {
	Media    CDNMedia `json:"media"`
	FileName string   `json:"file_name"`
}

type Video struct {
	Media      CDNMedia `json:"media"`
	ThumbMedia CDNMedia `json:"thumb_media"`
}

type CDNMedia struct {
	EncryptQueryParam string `json:"encrypt_query_param"`
	AESKey            string `json:"aes_key"`
	EncryptType       int    `json:"encrypt_type"`
}

// GetUpdatesResp 轮询响应结构
type GetUpdatesResp struct {
	Ret                  int             `json:"ret"`
	Errcode              int             `json:"errcode"`
	Errmsg               string          `json:"errmsg"`
	Msgs                 []WeixinMessage `json:"msgs"`
	UpdatesBuf           string          `json:"get_updates_buf"`
	LongpollingTimeoutMs int             `json:"longpolling_timeout_ms"`
}

// SendMessageResp 发送消息响应结构
type SendMessageResp struct {
	Ret          int    `json:"ret"`
	Errcode      int    `json:"errcode"`
	Errmsg       string          `json:"errmsg"`
	ContextToken string `json:"context_token"`
}

// GetUpdates 封装获取更新的请求
func (c *WechatClient) GetUpdates(ctx context.Context, buf string) (*GetUpdatesResp, error) {
	body := map[string]interface{}{
		"get_updates_buf": buf,
		"base_info":       BuildBaseInfo(),
	}

	respBytes, err := c.DoRequest(ctx, "POST", "/ilink/bot/getupdates", body)
	if err != nil {
		return nil, err
	}

	var resp GetUpdatesResp
	if err := json.Unmarshal(respBytes, &resp); err != nil {
		return nil, err
	}

	if resp.Ret != 0 && resp.Ret != -14 {
		return nil, fmt.Errorf("api logic error (ret=%d): %s", resp.Ret, resp.Errmsg)
	}

	return &resp, nil
}
