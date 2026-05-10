package api

import (
	"net/http"
	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type WeixinApi struct{}

// GetBot 获取当前活跃的微信 Bot 信息
func (a *WeixinApi) GetBot(c *gin.Context) {
	var cred models.WeixinBotCredential
	if err := global.DB.First(&cred).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"data": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cred})
}

// ToggleBot 切换 Bot 激活状态
func (a *WeixinApi) ToggleBot(c *gin.Context) {
	var body struct {
		Active bool `json:"active"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := global.DB.Model(&models.WeixinBotCredential{}).Where("1=1").Update("is_active", body.Active).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var cred models.WeixinBotCredential
	global.DB.First(&cred)
	if cred.ID > 0 {
		if body.Active {
			go service.StartWeixinBotPolling(cred.ID)
		} else {
			service.StopWeixinBotPolling(cred.ID)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "操作成功"})
}

// LogoutBot 退出并清除 Bot 凭证
func (a *WeixinApi) LogoutBot(c *gin.Context) {
	// 1. 停止所有正在运行的 poller
	service.StopAllWeixinBotPollings()

	// 2. 清除所有凭证
	if err := global.DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Where("1=1").Delete(&models.WeixinBotCredential{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 3. 同时清除用户上下文（可选，但建议保持干净）
	global.DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Where("1=1").Delete(&models.WeixinUserContext{})

	c.JSON(http.StatusOK, gin.H{"message": "已成功退出微信 Bot"})
}

// GetQRCode 获取登录二维码
func (a *WeixinApi) GetQRCode(c *gin.Context) {
	resp, err := service.GetWeixinQRCode()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": resp})
}

// CheckStatus 轮询扫码状态
func (a *WeixinApi) CheckStatus(c *gin.Context) {
	qrcode := c.Query("qrcode")
	if qrcode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "qrcode is required"})
		return
	}

	resp, err := service.CheckWeixinQRCodeStatus(qrcode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// 不向前端暴露 BotToken 和 BaseURL
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"status":        resp.Status,
		"ilink_bot_id":  resp.IlinkBotID,
		"ilink_user_id": resp.IlinkUserID,
	}})
}

// ListMessages 获取最近的消息记录
func (a *WeixinApi) ListMessages(c *gin.Context) {
	var msgs []models.WeixinMessage
	limit := 50
	if err := global.DB.Order("created_at desc").Limit(limit).Find(&msgs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// 转为正序返回给前端
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	c.JSON(http.StatusOK, gin.H{"data": msgs})
}

// SendManualReply 手动回复微信用户
func (a *WeixinApi) SendManualReply(c *gin.Context) {
	var body struct {
		UserID  string `json:"user_id"`
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var cred models.WeixinBotCredential
	if err := global.DB.First(&cred).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未发现已配置的微信 Bot"})
		return
	}

	var userCtx models.WeixinUserContext
	if err := global.DB.Where("bot_id = ? AND user_id = ?", cred.IlinkBotID, body.UserID).First(&userCtx).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "该用户在本次会话中暂无记录，无法回传 context_token"})
		return
	}

	// 调用 service 层的方法发送
	service.ReplyText(cred, body.UserID, body.Content, userCtx.ContextToken)
	c.JSON(http.StatusOK, gin.H{"message": "回复指令已下发"})
}
