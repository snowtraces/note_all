package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/pkg/weixin"
	"strings"
	"sync"
)

var (
	// botPollers 用于管理正在运行的长轮询 Goroutine
	botPollers = make(map[uint]context.CancelFunc)
	botMutex   sync.Mutex
)

// StopWeixinBotPolling 停止特定 Bot 的轮询
func StopWeixinBotPolling(credID uint) {
	botMutex.Lock()
	defer botMutex.Unlock()
	if cancel, exists := botPollers[credID]; exists {
		cancel()
		delete(botPollers, credID)
		log.Printf("[Wechat] 已停用 Bot Poller (ID: %d)", credID)
	}
}

// StopAllWeixinBotPollings 停止所有正在运行的轮询 (例如注销时)
func StopAllWeixinBotPollings() {
	botMutex.Lock()
	defer botMutex.Unlock()
	for id, cancel := range botPollers {
		cancel()
		log.Printf("[Wechat] 注销并停止所有 Bot Poller (ID: %d)", id)
	}
	botPollers = make(map[uint]context.CancelFunc)
}

// WeixinQRCodeResp 返回二维码结构
type WeixinQRCodeResp struct {
	QRCode           string `json:"qrcode"`
	QRCodeImgContent string `json:"qrcode_img_content"`
}

// WeixinStatusResp 轮询状态响应
type WeixinStatusResp struct {
	Status      string `json:"status"` // wait, scaned, confirmed, expired
	BotToken    string `json:"bot_token"`
	IlinkBotID  string `json:"ilink_bot_id"`
	IlinkUserID string `json:"ilink_user_id"`
	BaseURL     string `json:"baseurl"`
}

// GetWeixinQRCode 获取登录二维码
func GetWeixinQRCode() (*WeixinQRCodeResp, error) {
	url := fmt.Sprintf("%s/ilink/bot/get_bot_qrcode?bot_type=3", weixin.DefaultBaseURL)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-WECHAT-UIN", weixin.RandomWechatUin())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http error: %d, body: %s", resp.StatusCode, string(body))
	}

	var qrResp WeixinQRCodeResp
	if err := json.Unmarshal(body, &qrResp); err != nil {
		return nil, err
	}

	return &qrResp, nil
}

// CheckWeixinQRCodeStatus 轮询扫码状态
func CheckWeixinQRCodeStatus(qrcode string) (*WeixinStatusResp, error) {
	url := fmt.Sprintf("%s/ilink/bot/get_qrcode_status?qrcode=%s", weixin.DefaultBaseURL, qrcode)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("iLink-App-ClientVersion", "1")
	req.Header.Set("X-WECHAT-UIN", weixin.RandomWechatUin())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("http error: %d, body: %s", resp.StatusCode, string(body))
	}

	var statusResp WeixinStatusResp
	if err := json.Unmarshal(body, &statusResp); err != nil {
		return nil, err
	}

	// 如果确认成功，保存凭证
	if statusResp.Status == "confirmed" {
		cred, err := saveWeixinCredential(&statusResp)
		if err != nil {
			log.Printf("[Wechat] 无法保存微信凭证: %v", err)
		} else {
			log.Printf("[Wechat] 微信 Bot %s 登录成功，已授权用户 %s", statusResp.IlinkBotID, statusResp.IlinkUserID)
			// 本地持久化后，直接启动长轮询
			go StartWeixinBotPolling(cred.ID)
		}
	}

	return &statusResp, nil
}

// InitActiveWeixinBots 启动所有已激活的微信 Bot 监听器
func InitActiveWeixinBots() {
	var activeCreds []models.WeixinBotCredential
	if err := global.DB.Where("is_active = ?", true).Find(&activeCreds).Error; err != nil {
		log.Printf("[Wechat] 查询激活 Bot 失败: %v", err)
		return
	}

	for _, cred := range activeCreds {
		go StartWeixinBotPolling(cred.ID)
	}
	log.Printf("[Wechat] 初始化完毕，共启动 %d 个微信 Bot 监听器", len(activeCreds))
}

// StartWeixinBotPolling 对指定 Bot 进行长轮询监听
func StartWeixinBotPolling(credID uint) {
	botMutex.Lock()
	if _, exists := botPollers[credID]; exists {
		botMutex.Unlock()
		return // 已经在运行
	}
	ctx, cancel := context.WithCancel(context.Background())
	botPollers[credID] = cancel
	botMutex.Unlock()

	defer func() {
		botMutex.Lock()
		delete(botPollers, credID)
		botMutex.Unlock()
	}()

	for {
		select {
		case <-ctx.Done():
			return
		default:
			// 1. 获取最新凭证与游标
			var cred models.WeixinBotCredential
			if err := global.DB.First(&cred, credID).Error; err != nil {
				log.Printf("[Wechat][%d] 无法读取凭证，退出监听: %v", credID, err)
				return
			}
			if !cred.IsActive {
				log.Printf("[Wechat][%s] Bot 已在该节点停用", cred.IlinkBotID)
				return
			}

			// 2. 准备客户端
			client := weixin.NewWechatClient(cred.BaseURL, cred.BotToken)

			// 3. 执行长轮询
			resp, err := client.GetUpdates(ctx, cred.UpdatesBuf)
			if err != nil {
				// 如果是由于 context 取消导致的错误，直接退出
				if ctx.Err() != nil {
					return
				}
				log.Printf("[Wechat][%s] 轮询异常 (Buf: %s): %v", cred.IlinkBotID, cred.UpdatesBuf, err)
				time.Sleep(5 * time.Second) // 错误退避
				continue
			}

			// 4. 处理会话失效 (-14)
			if resp.Ret == -14 || resp.Errcode == -14 {
				log.Printf("[Wechat][%s] 会话已失效 (-14)，停止监听，请重新扫码", cred.IlinkBotID)
				global.DB.Model(&models.WeixinBotCredential{}).Where("id = ?", credID).Updates(map[string]interface{}{
					"is_active":   false,
					"updates_buf": "", // 失效时清空游标
				})
				return
			}

			// 5. 更新游标记录
			if resp.UpdatesBuf != "" && resp.UpdatesBuf != cred.UpdatesBuf {
				global.DB.Model(&models.WeixinBotCredential{}).Where("id = ?", credID).Update("updates_buf", resp.UpdatesBuf)
			}

			// 6. 路由并处理消息
			if len(resp.Msgs) > 0 {
				for _, msg := range resp.Msgs {
					// 缓存 context_token 并录入消息
					processWeixinMessage(cred, msg)
				}
			}

			// 轮询成功，更新下一次轮询的耗时建议 (如果有)
			if resp.LongpollingTimeoutMs > 0 {
				// 实际客户端超时由 http.Client 控制，此处不建议修改 client.Timeout 以防请求还没返回就杀掉
			}
		}
	}
}

// processWeixinMessage 处理接收到的单条消息
func processWeixinMessage(cred models.WeixinBotCredential, msg weixin.WeixinMessage) {
	// 忽略来自机器人自身的回复
	if msg.MessageType == 2 {
		return
	}

	// 1. 更新上下文 ContextToken (供后续回复使用)
	var ctx models.WeixinUserContext
	global.DB.Where("bot_id = ? AND user_id = ?", cred.IlinkBotID, msg.FromUserID).First(&ctx)
	ctx.BotID = cred.IlinkBotID
	ctx.UserID = msg.FromUserID
	ctx.ContextToken = msg.ContextToken
	if ctx.ID == 0 {
		global.DB.Create(&ctx)
	} else {
		global.DB.Save(&ctx)
	}

	// 2. 按类型处理内容
	for _, item := range msg.ItemList {
		switch item.Type {
		case 1: // TEXT
			if item.TextItem != nil {
				saveWeixinInteraction(cred.IlinkBotID, msg.FromUserID, item.TextItem.Text, 1, "incoming")
				handleWeixinText(cred, msg.FromUserID, item.TextItem.Text, msg.ContextToken)
			}
		case 2, 3, 4, 5: // IMAGE, VOICE, FILE, VIDEO
			var media *weixin.CDNMedia
			var fileName string
			var fileType string

			switch item.Type {
			case 2:
				media = &item.ImageItem.Media
				fileName = fmt.Sprintf("wx_img_%d.jpg", msg.MessageID)
				fileType = "image/jpeg"
			case 3:
				media = &item.VoiceItem.Media
				fileName = fmt.Sprintf("wx_voice_%d.amr", msg.MessageID)
				fileType = "audio/amr"
			case 4:
				media = &item.FileItem.Media
				fileName = item.FileItem.FileName
				fileType = "application/octet-stream"
			case 5:
				media = &item.VideoItem.Media
				fileName = fmt.Sprintf("wx_video_%d.mp4", msg.MessageID)
				fileType = "video/mp4"
			}

			if media != nil {
				saveWeixinInteraction(cred.IlinkBotID, msg.FromUserID, fmt.Sprintf("[媒体文件: %s]", fileName), item.Type, "incoming")
				
				// 异步下载并保存，不阻塞主循环
				go func(m weixin.CDNMedia, fName, fType string) {
					client := weixin.NewWechatClient(cred.BaseURL, cred.BotToken)
					data, err := client.DownloadMedia(m.EncryptQueryParam, m.AESKey)
					if err != nil {
						log.Printf("[Wechat][%s] 媒体下载失败 (MsgID:%d): %v", cred.IlinkBotID, msg.MessageID, err)
						return
					}

					// 存入底层块系统 (snow_storage)
					secureName := fmt.Sprintf("wx_%d_%s", time.Now().UnixNano(), fName)
					storageID, err := global.Storage.Save(secureName, bytes.NewReader(data))
					if err != nil {
						log.Printf("[Wechat] 媒体保存失败: %v", err)
						return
					}

					// 构建并落库 NoteItem
					note := models.NoteItem{
						OriginalName: fName,
						StorageID:    storageID,
						FileType:     fType,
						FileSize:     int64(len(data)),
						Status:       "pending",
					}
					if err := global.DB.Create(&note).Error; err != nil {
						log.Printf("[Wechat] 媒体笔记创建失败: %v", err)
						return
					}

					// 发送通知
					ReplyText(cred, msg.FromUserID, fmt.Sprintf("🎨 媒体素材已自动存入收件箱 (ID:%d)，正在为您准备智能摘要与标签...", note.ID), msg.ContextToken)

					// 唤起 LLM 全链路分析
					nID := note.ID
					global.WorkerChan <- func() {
						performFullAnalysis(nID, 0)
					}
				}(*media, fileName, fileType)
			}
		}
	}
}

// handleWeixinText 核心文本处理逻辑 (RAG 问答与笔记保存的策略路由)
func handleWeixinText(cred models.WeixinBotCredential, userID, text, contextToken string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}

	log.Printf("[Wechat][%s] 收到消息: %s", cred.IlinkBotID, text)

	// 逻辑：如果识别为提问，走 RAG；否则走笔记保存
	intent := IntentDetection(text)
	if intent == "search" || intent == "explore" {
		// 执行 RAG
		go func() {
			ReplyText(cred, userID, "🔍 正在为您检索知识库...", contextToken)
			answer, hits, _, err := RAGAsk(text)
			if err != nil {
				ReplyText(cred, userID, "❌ 检索出现异常，请稍后再试: "+err.Error(), contextToken)
				return
			}

			if len(hits) == 0 {
				ReplyText(cred, userID, "⚠️ 在您的笔记中暂未找到相关记录。\n\n"+answer, contextToken)
			} else {
				// 汇总结果
				refText := "\n\n📚 相关笔记参考："
				for i, h := range hits {
					if i >= 3 {
						break
					}
					refText += fmt.Sprintf("\n· [%s]", h.OriginalName)
				}
				ReplyText(cred, userID, answer+refText, contextToken)
			}
		}()
	} else {
		// 执行笔记录入
		go func() {
			note, err := CreateNoteFromText(text, "")
			if err != nil {
				ReplyText(cred, userID, "❌ 笔记录入失败: "+err.Error(), contextToken)
				return
			}
			resText := fmt.Sprintf("✅ 笔记已存入收件箱 (ID:%d)。\nAI 正在尝试提炼摘要与标签...", note.ID)
			ReplyText(cred, userID, resText, contextToken)
		}()
	}
}

// ReplyText 快捷发送文本回复 (已导出，供 API 调用)
func ReplyText(cred models.WeixinBotCredential, toUserID, text, contextToken string) {
	client := weixin.NewWechatClient(cred.BaseURL, cred.BotToken)
	clientID := fmt.Sprintf("reply-%d-%d", cred.ID, time.Now().UnixNano())

	items := []weixin.MessageItem{
		{
			Type:     1, // TEXT
			TextItem: &weixin.Text{Text: text},
		},
	}

	if err := client.SendMessage(context.Background(), toUserID, clientID, contextToken, items); err != nil {
		log.Printf("[Wechat][%s] 发送回复失败: %v", cred.IlinkBotID, err)
	} else {
		saveWeixinInteraction(cred.IlinkBotID, toUserID, text, 1, "outgoing")
	}
}

// saveWeixinInteraction 持久化互动记录到数据库，供前端会话功能使用
func saveWeixinInteraction(botID, userID, content string, msgType int, direction string) {
	msg := models.WeixinMessage{
		BotID:     botID,
		UserID:    userID,
		Content:   content,
		Type:      msgType,
		Direction: direction,
	}
	// 异步保存，不阻塞主流程
	go func() {
		if err := global.DB.Create(&msg).Error; err != nil {
			log.Printf("[Wechat] 无法保存互动记录: %v", err)
		}
	}()
}

// saveWeixinCredential 将凭证持久化到数据库
func saveWeixinCredential(resp *WeixinStatusResp) (*models.WeixinBotCredential, error) {
	var cred models.WeixinBotCredential
	// 针对同一个 Bot ID 更新或者创建
	global.DB.Where("ilink_bot_id = ?", resp.IlinkBotID).First(&cred)

	cred.BotToken = resp.BotToken
	cred.BaseURL = resp.BaseURL
	cred.IlinkBotID = resp.IlinkBotID
	cred.IlinkUserID = resp.IlinkUserID
	cred.IsActive = true
	cred.LastPollTime = time.Now()

	var err error
	if cred.ID == 0 {
		err = global.DB.Create(&cred).Error
	} else {
		err = global.DB.Save(&cred).Error
	}
	return &cred, err
}
