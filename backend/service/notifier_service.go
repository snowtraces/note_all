package service

import (
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"html"
	"net/smtp"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
)

// NotifierSettings 全局推送与发信服务器设置
type NotifierSettings struct {
	SMTPHost     string `json:"smtp_host"`
	SMTPPort     int    `json:"smtp_port"`
	SMTPUsername string `json:"smtp_username"`
	SMTPPassword string `json:"smtp_password"`
	SiteURL      string `json:"site_url"` // 站点访问地址，用于生成分享链接 (如 http://192.168.1.5:3344)
}

// TaskNotificationConfig 任务级的通知启用配置 (解析自 CronTask.Notification)
type TaskNotificationConfig struct {
	PushWechatBot bool   `json:"push_wechat_bot"`
	PushEmail     bool   `json:"push_email"`
	EmailTo       string `json:"email_to"`
}

// SendTaskNotification 发送定时任务执行报告
func SendTaskNotification(taskName string, runLog *models.CronTaskLog, notifStr string) {
	if notifStr == "" {
		return
	}

	var notifCfg TaskNotificationConfig
	if err := json.Unmarshal([]byte(notifStr), &notifCfg); err != nil {
		log.Printf("[Notifier] 任务通知配置解析失败 (TaskName: %s): %v", taskName, err)
		return
	}

	// 如果没有开启任何推送通道，直接退出
	if !notifCfg.PushEmail && !notifCfg.PushWechatBot {
		return
	}

	// 加载全局通知设置 (邮件 SMTP + 站点地址)
	var notifierSettings NotifierSettings
	var settingsList []models.SystemSetting
	if err := global.DB.Where("key = ?", "cron_notifier_settings").Limit(1).Find(&settingsList).Error; err != nil {
		log.Printf("[Notifier] 查询全局推送参数失败: %v", err)
	} else if len(settingsList) > 0 {
		if err := json.Unmarshal([]byte(settingsList[0].Value), &notifierSettings); err != nil {
			log.Printf("[Notifier] 全局推送配置解析失败: %v", err)
		}
	}

	// 2. 准备邮件推送内容 (保持完整格式)
	statusEmoji := "🟢"
	if runLog.Status != "success" {
		statusEmoji = "🔴"
	}
	duration := runLog.EndTime.Sub(runLog.StartTime).Round(time.Millisecond)

	title := fmt.Sprintf("%s 定时任务报告: %s", statusEmoji, taskName)
	body := fmt.Sprintf(
		"<h3>📋 Note All 定时任务执行简报</h3>"+
			"<p><b>任务名称：</b>%s</p>"+
			"<p><b>执行状态：</b>%s (%s)</p>"+
			"<p><b>启动时间：</b>%s</p>"+
			"<p><b>耗时时长：</b>%s</p>"+
			"<p><b>执行概要：</b>%s</p>",
		taskName,
		runLog.Status,
		statusEmoji,
		runLog.StartTime.Format("2006-01-02 15:04:05"),
		duration.String(),
		runLog.ResultSummary,
	)
	if runLog.ErrorMessage != "" {
		body += fmt.Sprintf("<p style='color:red;'><b>报错异常日志：</b><pre>%s</pre></p>", html.EscapeString(runLog.ErrorMessage))
	}

	// 3. 执行邮件推送
	if notifCfg.PushEmail && notifCfg.EmailTo != "" && notifierSettings.SMTPHost != "" {
		go func() {
			err := SendEmail(
				notifierSettings.SMTPHost,
				notifierSettings.SMTPPort,
				notifierSettings.SMTPUsername,
				notifierSettings.SMTPPassword,
				notifCfg.EmailTo,
				title,
				body,
			)
			if err != nil {
				log.Printf("[Notifier] 邮件推送失败 (Task: %s, To: %s): %v", taskName, notifCfg.EmailTo, err)
			} else {
				log.Printf("[Notifier] 邮件推送成功 (Task: %s, To: %s)", taskName, notifCfg.EmailTo)
			}
		}()
	}

	// 为本次任务执行期间创建的笔记生成分享链接
	var shareURLs []string
	if notifierSettings.SiteURL != "" {
		siteURL := strings.TrimRight(notifierSettings.SiteURL, "/")
		var notes []models.NoteItem
		if runLog.CreatedNoteIDs == "" {
			return
		}

		// 仅使用精准绑定的 ID 列表进行查询
		ids := strings.Split(runLog.CreatedNoteIDs, ",")
		if global.DB.Where("id IN ?", ids).Find(&notes).Error == nil && len(notes) > 0 {
			for _, note := range notes {
				link, err := GenerateShareLink(note.ID, 0)
				if err == nil {
					shareURLs = append(shareURLs, siteURL+"/s/"+link.ID)
				}
			}
		}
	}

	// 构建精简微信消息: 任务 + 时间 + URL
	msgText := fmt.Sprintf("%s | %s", taskName, runLog.StartTime.Format("2006-01-02 15:04"))
	if len(shareURLs) > 0 {
		msgText += "\n" + strings.Join(shareURLs, "\n")
	}

	// 4. 执行微信通道推送
	if notifCfg.PushWechatBot {
		go func() {
			var activeCreds []models.WeixinBotCredential
			if err := global.DB.Where("is_active = ?", true).Find(&activeCreds).Error; err == nil && len(activeCreds) > 0 {
				sentUsers := make(map[string]bool)

				var contexts []models.WeixinUserContext
				if err := global.DB.Find(&contexts).Error; err == nil {
					for _, ctx := range contexts {
						for _, cred := range activeCreds {
							if cred.IlinkBotID == ctx.BotID {
								ReplyText(cred, ctx.UserID, msgText, ctx.ContextToken)
								sentUsers[ctx.UserID] = true
								log.Printf("[Notifier] 已向交互用户发送微信通知 (Task: %s, User: %s)", taskName, ctx.UserID)
							}
						}
					}
				}

				for _, cred := range activeCreds {
					if cred.IlinkUserID != "" && !sentUsers[cred.IlinkUserID] {
						var ownerCtx models.WeixinUserContext
						token := ""
						if global.DB.Where("bot_id = ? AND user_id = ?", cred.IlinkBotID, cred.IlinkUserID).First(&ownerCtx).Error == nil {
							token = ownerCtx.ContextToken
						}
						ReplyText(cred, cred.IlinkUserID, msgText, token)
						log.Printf("[Notifier] 已向 Bot 拥有者管理员发送微信通知 (Task: %s, Owner: %s)", taskName, cred.IlinkUserID)
					}
				}
			} else {
				log.Printf("[Notifier] 微信通知已开启，但当前系统中无活跃登录的扫码微信 Bot，跳过微信推送")
			}
		}()
	}
}

// SendEmail 发送 SMTP 邮件 (完美兼容 465 隐式 SSL/TLS 及 25/587 STARTTLS 端口)
func SendEmail(host string, port int, username, password, to, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", host, port)

	headers := make(map[string]string)
	headers["From"] = username
	headers["To"] = to
	// UTF-8 编码处理主题
	encodedSubject := fmt.Sprintf("=?UTF-8?B?%s?=", base64.StdEncoding.EncodeToString([]byte(subject)))
	headers["Subject"] = encodedSubject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = "text/html; charset=UTF-8"

	var msgBody strings.Builder
	for k, v := range headers {
		msgBody.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	msgBody.WriteString("\r\n")
	msgBody.WriteString(body)

	// 如果是 465 端口，采用 explicit SSL/TLS
	if port == 465 {
		tlsConfig := &tls.Config{
			ServerName:         host,
		}
		conn, err := tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			return fmt.Errorf("TLS dial failed: %v", err)
		}
		defer conn.Close()

		c, err := smtp.NewClient(conn, host)
		if err != nil {
			return fmt.Errorf("SMTP client creation failed: %v", err)
		}
		defer c.Close()

		auth := smtp.PlainAuth("", username, password, host)
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("SMTP auth failed: %v", err)
		}

		if err := c.Mail(username); err != nil {
			return err
		}
		if err := c.Rcpt(to); err != nil {
			return err
		}

		w, err := c.Data()
		if err != nil {
			return err
		}
		_, err = w.Write([]byte(msgBody.String()))
		if err != nil {
			return err
		}
		err = w.Close()
		if err != nil {
			return err
		}
		return c.Quit()
	}

	// 其他普通端口 (25, 587) 采用标准 smtp.SendMail
	auth := smtp.PlainAuth("", username, password, host)
	err := smtp.SendMail(addr, auth, username, []string{to}, []byte(msgBody.String()))
	return err
}
