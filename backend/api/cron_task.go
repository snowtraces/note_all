package api

import (
	"encoding/json"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/service"
	"note_all_backend/utils"

	"github.com/gin-gonic/gin"
)

// 允许的 schedule_type 值
var allowedScheduleTypes = map[string]bool{"interval": true, "cron": true, "daily": true}

type CronApi struct{}

// ==================== 1. 定时任务 (CronTask) CRUD ====================

// ListTasks 返回定时任务列表（支持分页）
func (a *CronApi) ListTasks(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	limitStr := c.DefaultQuery("limit", "50")

	page, _ := strconv.Atoi(pageStr)
	limit, _ := strconv.Atoi(limitStr)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	var tasks []models.CronTask
	var total int64

	global.DB.Model(&models.CronTask{}).Count(&total)
	if err := global.DB.Order("id desc").Limit(limit).Offset(offset).Find(&tasks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取定时任务列表失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": tasks, "total": total})
}

// CreateTask 创建定时任务
func (a *CronApi) CreateTask(c *gin.Context) {
	var body struct {
		Name          string `json:"name" binding:"required"`
		ScheduleType  string `json:"schedule_type" binding:"required"`
		ScheduleValue string `json:"schedule_value" binding:"required"`
		Steps         string `json:"steps" binding:"required"`
		Notification  string `json:"notification"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数校验失败"})
		return
	}

	// 验证 schedule_type
	if !allowedScheduleTypes[body.ScheduleType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的调度类型: " + body.ScheduleType + " (支持: interval, cron, daily)"})
		return
	}

	// 验证管道步骤
	steps, err := service.ParseSteps(body.Steps)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "管道步骤格式错误: " + err.Error()})
		return
	}
	if err := service.ValidateSteps(steps); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.Notification != "" && !json.Valid([]byte(body.Notification)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "通知配置 (notification) 必须是合法 JSON"})
		return
	}

	nextTime := service.CalculateNextRunTime(body.ScheduleType, body.ScheduleValue, time.Now())

	task := models.CronTask{
		Name:          body.Name,
		Status:        "paused",
		ScheduleType:  body.ScheduleType,
		ScheduleValue: body.ScheduleValue,
		Steps:         body.Steps,
		Notification:  body.Notification,
		NextRunTime:   nextTime,
	}

	if err := global.DB.Create(&task).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建定时任务失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "创建定时任务成功", "data": task})
}

// UpdateTask 编辑定时任务
func (a *CronApi) UpdateTask(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Name          string `json:"name" binding:"required"`
		ScheduleType  string `json:"schedule_type" binding:"required"`
		ScheduleValue string `json:"schedule_value" binding:"required"`
		Steps         string `json:"steps" binding:"required"`
		Notification  string `json:"notification"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数校验失败"})
		return
	}

	if !allowedScheduleTypes[body.ScheduleType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的调度类型: " + body.ScheduleType})
		return
	}

	// 验证管道步骤
	steps, err := service.ParseSteps(body.Steps)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "管道步骤格式错误: " + err.Error()})
		return
	}
	if err := service.ValidateSteps(steps); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if body.Notification != "" && !json.Valid([]byte(body.Notification)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "通知配置 (notification) 必须是合法 JSON"})
		return
	}

	var task models.CronTask
	if err := global.DB.First(&task, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
		return
	}

	var nextTime *time.Time
	if task.Status == "active" {
		nextTime = service.CalculateNextRunTime(body.ScheduleType, body.ScheduleValue, time.Now())
	} else {
		nextTime = task.NextRunTime
	}

	updates := map[string]interface{}{
		"name":           body.Name,
		"schedule_type":  body.ScheduleType,
		"schedule_value": body.ScheduleValue,
		"steps":          body.Steps,
		"notification":   body.Notification,
		"next_run_time":  nextTime,
	}

	if err := global.DB.Model(&task).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新定时任务失败"})
		return
	}

	global.DB.First(&task, task.ID)
	c.JSON(http.StatusOK, gin.H{"message": "更新定时任务成功", "data": task})
}

// DeleteTask 删除定时任务及日志
func (a *CronApi) DeleteTask(c *gin.Context) {
	id := c.Param("id")
	var task models.CronTask
	if err := global.DB.First(&task, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
		return
	}

	tx := global.DB.Begin()
	if err := tx.Delete(&task).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除定时任务失败"})
		return
	}
	// I1: 检查日志删除错误
	if err := tx.Where("task_id = ?", id).Delete(&models.CronTaskLog{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除任务关联日志失败"})
		return
	}
	tx.Commit()

	c.JSON(http.StatusOK, gin.H{"message": "删除定时任务成功"})
}

// ToggleTask 开启/暂停任务
func (a *CronApi) ToggleTask(c *gin.Context) {
	id := c.Param("id")
	var task models.CronTask
	if err := global.DB.First(&task, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
		return
	}

	newStatus := "paused"
	var nextTime *time.Time
	if task.Status == "paused" {
		newStatus = "active"
		nextTime = service.CalculateNextRunTime(task.ScheduleType, task.ScheduleValue, time.Now())
	}

	updates := map[string]interface{}{
		"status":        newStatus,
		"next_run_time": nextTime,
	}

	if err := global.DB.Model(&task).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "切换任务状态失败"})
		return
	}

	// I2: 重新读取返回最新数据
	global.DB.First(&task, task.ID)
	c.JSON(http.StatusOK, gin.H{"message": "任务状态已变更", "data": task})
}

// RunTask 立即手动触发执行一次
func (a *CronApi) RunTask(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "任务 ID 格式错误"})
		return
	}

	// I26: 检查是否已有 running 日志，防止重复触发
	var runningLogs []models.CronTaskLog
	global.DB.Where("task_id = ? AND status = ?", id, "running").Find(&runningLogs)
	if len(runningLogs) > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "任务仍在运行中，请等待完成后再触发"})
		return
	}

	err = service.TriggerSingleTaskImmediately(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "任务触发失败，请稍后再试"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "定时任务已在后台启动执行。报告将发送至您的配置触点。"})
}

// GetTaskLogs 分页查询指定任务的运行历史日志
func (a *CronApi) GetTaskLogs(c *gin.Context) {
	taskID := c.Param("id")
	pageStr := c.DefaultQuery("page", "1")
	limitStr := c.DefaultQuery("limit", "10")

	page, _ := strconv.Atoi(pageStr)
	limit, _ := strconv.Atoi(limitStr)
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 10
	}
	// I25: 上限 100
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit

	var logs []models.CronTaskLog
	var total int64

	dbBase := global.DB.Model(&models.CronTaskLog{}).Where("task_id = ?", taskID)
	dbBase.Count(&total)

	if err := dbBase.Order("id desc").Limit(limit).Offset(offset).Find(&logs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取任务日志失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": logs, "total": total})
}

// ==================== 2. 自定义抽取规则 (ExtractorRule) CRUD ====================

// ListRules 获取自定义抽取配置规则列表（支持分页）
func (a *CronApi) ListRules(c *gin.Context) {
	pageStr := c.DefaultQuery("page", "1")
	limitStr := c.DefaultQuery("limit", "50")

	page, _ := strconv.Atoi(pageStr)
	limit, _ := strconv.Atoi(limitStr)
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	var rules []models.ExtractorRule
	var total int64

	global.DB.Model(&models.ExtractorRule{}).Count(&total)
	if err := global.DB.Order("id desc").Limit(limit).Offset(offset).Find(&rules).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取网页抽取规则列表失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rules, "total": total})
}

// CreateRule 新建自定义抽取规则
func (a *CronApi) CreateRule(c *gin.Context) {
	var body struct {
		Name             string `json:"name" binding:"required"`
		UrlPattern       string `json:"url_pattern" binding:"required"`
		RuleType         string `json:"rule_type"`
		ItemSelector     string `json:"item_selector"`
		LinkSelector     string `json:"link_selector"`
		TitleSelector    string `json:"title_selector" binding:"required"`
		BodySelector     string `json:"body_selector" binding:"required"`
		AuthorSelector   string `json:"author_selector"`
		DateSelector     string `json:"date_selector"`
		ExcludeSelectors string `json:"exclude_selectors"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数校验失败"})
		return
	}

	// 正则有效性检验
	if _, err := regexp.Compile(body.UrlPattern); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "URL 匹配正则表达式格式不合法"})
		return
	}

	rule := models.ExtractorRule{
		Name:             body.Name,
		UrlPattern:       body.UrlPattern,
		RuleType:         body.RuleType,
		ItemSelector:     body.ItemSelector,
		LinkSelector:     body.LinkSelector,
		TitleSelector:    body.TitleSelector,
		BodySelector:     body.BodySelector,
		AuthorSelector:   body.AuthorSelector,
		DateSelector:     body.DateSelector,
		ExcludeSelectors: body.ExcludeSelectors,
	}
	if rule.RuleType == "" {
		rule.RuleType = "detail"
	}

	if err := global.DB.Create(&rule).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "添加网页规则失败，可能是正则表达式模式重复"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "成功创建抽取配置规则", "data": rule})
}

// UpdateRule 更新自定义抽取规则
func (a *CronApi) UpdateRule(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Name             string `json:"name" binding:"required"`
		UrlPattern       string `json:"url_pattern" binding:"required"`
		RuleType         string `json:"rule_type"`
		ItemSelector     string `json:"item_selector"`
		LinkSelector     string `json:"link_selector"`
		TitleSelector    string `json:"title_selector" binding:"required"`
		BodySelector     string `json:"body_selector" binding:"required"`
		AuthorSelector   string `json:"author_selector"`
		DateSelector     string `json:"date_selector"`
		ExcludeSelectors string `json:"exclude_selectors"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数校验失败"})
		return
	}

	if _, err := regexp.Compile(body.UrlPattern); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "URL 匹配正则表达式格式不合法"})
		return
	}

	var rule models.ExtractorRule
	if err := global.DB.First(&rule, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "网页匹配规则不存在"})
		return
	}

	if body.RuleType == "" {
		body.RuleType = "detail"
	}

	updates := map[string]interface{}{
		"name":              body.Name,
		"url_pattern":       body.UrlPattern,
		"rule_type":         body.RuleType,
		"item_selector":     body.ItemSelector,
		"link_selector":     body.LinkSelector,
		"title_selector":    body.TitleSelector,
		"body_selector":     body.BodySelector,
		"author_selector":   body.AuthorSelector,
		"date_selector":     body.DateSelector,
		"exclude_selectors": body.ExcludeSelectors,
	}

	if err := global.DB.Model(&rule).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "修改网页规则失败"})
		return
	}

	// I2: 重新读取返回最新数据
	global.DB.First(&rule, rule.ID)
	c.JSON(http.StatusOK, gin.H{"message": "修改抽取规则成功", "data": rule})
}

// DeleteRule 删除网页抽取规则
func (a *CronApi) DeleteRule(c *gin.Context) {
	id := c.Param("id")
	var rule models.ExtractorRule
	if err := global.DB.First(&rule, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "规则匹配不存在"})
		return
	}

	if err := global.DB.Delete(&rule).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "网页抽取匹配规则已被移除"})
}

// TestRule 测试特定 URL 下的 CSS 抽取提取成效
func (a *CronApi) TestRule(c *gin.Context) {
	var body struct {
		Url              string `json:"url" binding:"required"`
		RuleType         string `json:"rule_type"`
		ItemSelector     string `json:"item_selector"`
		LinkSelector     string `json:"link_selector"`
		TitleSelector    string `json:"title_selector" binding:"required"`
		BodySelector     string `json:"body_selector" binding:"required"`
		DateSelector     string `json:"date_selector"`
		ExcludeSelectors string `json:"exclude_selectors"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数格式校验失败，请检查 URL 及选择器是否填写完整"})
		return
	}

	// SSRF 安全验证
	if err := utils.IsSafeURL(body.Url); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "URL 安全校验失败: " + err.Error()})
		return
	}

	tempRule := models.ExtractorRule{
		Name:             "规则测试",
		RuleType:         body.RuleType,
		ItemSelector:     body.ItemSelector,
		LinkSelector:     body.LinkSelector,
		TitleSelector:    body.TitleSelector,
		BodySelector:     body.BodySelector,
		DateSelector:     body.DateSelector,
		ExcludeSelectors: body.ExcludeSelectors,
	}

	title, markdown, err := service.TestExtractorRule(body.Url, &tempRule)
	if err != nil {
		// S11: 返回通用错误消息，不暴露内部细节
		log.Printf("[CronApi] TestRule 错误 (URL: %s): %v", body.Url, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "网页抓取测试失败，请检查 URL 和规则配置"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"title":    title,
		"markdown": markdown,
	})
}

// ==================== 3. 全局推送配置 (SystemSetting) CRUD ====================

// GetSettings 获取全局推送脱敏配置
func (a *CronApi) GetSettings(c *gin.Context) {
	var setting models.SystemSetting
	err := global.DB.Where("key = ?", "cron_notifier_settings").First(&setting).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{
			"smtp_host":     "",
			"smtp_port":     465,
			"smtp_username": "",
			"smtp_password": "",
			"has_password":  false,
			"site_url":      "",
		}})
		return
	}

	var notifierSettings service.NotifierSettings
	if err := json.Unmarshal([]byte(setting.Value), &notifierSettings); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "全局配置项序列化解析异常"})
		return
	}

	// I19: 安全脱敏：使用 has_password 标志而非固定星号占位符
	hasPassword := notifierSettings.SMTPPassword != ""
	notifierSettings.SMTPPassword = ""

	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"smtp_host":     notifierSettings.SMTPHost,
		"smtp_port":     notifierSettings.SMTPPort,
		"smtp_username": notifierSettings.SMTPUsername,
		"smtp_password": "",
		"has_password":  hasPassword,
		"site_url":      notifierSettings.SiteURL,
	}})
}

// UpdateSettings 保存或更新全局推送设置
func (a *CronApi) UpdateSettings(c *gin.Context) {
	var body struct {
		SMTPHost     string `json:"smtp_host"`
		SMTPPort     int    `json:"smtp_port"`
		SMTPUsername string `json:"smtp_username"`
		SMTPPassword string `json:"smtp_password"`
		SiteURL      string `json:"site_url"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数格式异常"})
		return
	}

	var setting models.SystemSetting
	err := global.DB.Where("key = ?", "cron_notifier_settings").First(&setting).Error

	// I19: 仅在前端提供了非空密码时才更新，否则保留原值
	realPassword := ""
	if err == nil {
		var oldSettings service.NotifierSettings
		_ = json.Unmarshal([]byte(setting.Value), &oldSettings)
		if body.SMTPPassword != "" {
			realPassword = body.SMTPPassword
		} else {
			realPassword = oldSettings.SMTPPassword // 保留原密码
		}
	} else {
		realPassword = body.SMTPPassword // 新配置，直接使用提交的密码
	}

	newSettings := service.NotifierSettings{
		SMTPHost:     body.SMTPHost,
		SMTPPort:     body.SMTPPort,
		SMTPUsername: body.SMTPUsername,
		SMTPPassword: realPassword,
		SiteURL:      strings.TrimSpace(body.SiteURL),
	}

	// I8: 检查 json.Marshal 错误
	valBytes, err := json.Marshal(newSettings)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "配置序列化失败"})
		return
	}

	setting.Key = "cron_notifier_settings"
	setting.Value = string(valBytes)

	var dbErr error
	if setting.ID == 0 {
		dbErr = global.DB.Create(&setting).Error
	} else {
		dbErr = global.DB.Save(&setting).Error
	}

	if dbErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库保存失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "保存全局配置项成功"})
}