package models

import "time"

// WeixinBotCredential 存储微信 Bot 的认证凭证与运行状态
type WeixinBotCredential struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	
	BotToken     string    `gorm:"size:255;not null" json:"-"`      // Bearer Token
	BaseURL      string    `gorm:"size:255;not null" json:"base_url"`       // 业务 API 基座地址
	IlinkBotID   string    `gorm:"size:128;not null;index" json:"ilink_bot_id"` // Bot 账号 ID (...@im.bot)
	IlinkUserID  string    `gorm:"size:128;not null" json:"ilink_user_id"`  // 授权用户 ID (...@im.wechat)
	
	UpdatesBuf   string    `gorm:"type:text" json:"updates_buf"`            // getupdates 游标上下文
	IsActive     bool      `gorm:"default:true" json:"is_active"`           // 是否激活监听
	LastPollTime time.Time `json:"last_poll_time"`                          // 上次成功轮询时间
}

// WeixinUserContext 记录微信用户的会话上下文，主要用于回复消息时回传 context_token
type WeixinUserContext struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	BotID        string    `gorm:"size:128;not null;index:uidx_bot_user" json:"bot_id"`
	UserID       string    `gorm:"size:128;not null;index:uidx_bot_user" json:"user_id"`
	ContextToken string    `gorm:"type:text" json:"context_token"` // 最近一次收到的 context_token
	UpdatedAt    time.Time `json:"updated_at"`
}

// WeixinMessage 存储每条互动的消息，供前端查看监控
type WeixinMessage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	
	BotID     string    `gorm:"size:128;index" json:"bot_id"`
	UserID    string    `gorm:"size:128;index" json:"user_id"`
	
	Content   string    `gorm:"type:text" json:"content"`
	Type      int       `json:"type"`                     // 1=TEXT, 2=IMAGE...
	Direction string    `gorm:"size:16" json:"direction"` // incoming(用户发) / outgoing(Bot发)
}
