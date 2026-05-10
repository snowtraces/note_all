package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
	"note_all_backend/service"

	"github.com/gin-gonic/gin"
)

type CronApi struct{}

// ==================== 1. 定时任务 (CronTask) CRUD ====================

// ListTasks 返回全量定时任务列表
func (a *CronApi) ListTasks(c *gin.Context) {
	var tasks []models.CronTask
	if err := global.DB.Order("id desc").Find(&tasks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取定时任务列表失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": tasks})
}

// CreateTask 创建定时任务
func (a *CronApi) CreateTask(c *gin.Context) {
	var body struct {
		Name          string `json:"name" binding:"required"`
		TaskType      string `json:"task_type" binding:"required"`
		ScheduleType  string `json:"schedule_type" binding:"required"`
		ScheduleValue string `json:"schedule_value" binding:"required"`
		Config        string `json:"config"`
		Notification  string `json:"notification"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数校验失败"})
		return
	}

	// 预解析时间戳
	nextTime := service.CalculateNextRunTime(body.ScheduleType, body.ScheduleValue, time.Now())

	task := models.CronTask{
		Name:          body.Name,
		TaskType:      body.TaskType,
		Status:        "paused", // 默认新建处于暂停状态
		ScheduleType:  body.ScheduleType,
		ScheduleValue: body.ScheduleValue,
		Config:        body.Config,
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
		TaskType      string `json:"task_type" binding:"required"`
		ScheduleType  string `json:"schedule_type" binding:"required"`
		ScheduleValue string `json:"schedule_value" binding:"required"`
		Config        string `json:"config"`
		Notification  string `json:"notification"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数校验失败"})
		return
	}

	var task models.CronTask
	if err := global.DB.First(&task, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
		return
	}

	// 重新计算下一次计划运行时间
	var nextTime *time.Time
	if task.Status == "active" {
		nextTime = service.CalculateNextRunTime(body.ScheduleType, body.ScheduleValue, time.Now())
	} else {
		nextTime = task.NextRunTime
	}

	updates := map[string]interface{}{
		"name":           body.Name,
		"task_type":      body.TaskType,
		"schedule_type":  body.ScheduleType,
		"schedule_value": body.ScheduleValue,
		"config":         body.Config,
		"notification":   body.Notification,
		"next_run_time":  nextTime,
	}

	if err := global.DB.Model(&task).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新定时任务失败"})
		return
	}

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
	// 删除任务本身
	if err := tx.Delete(&task).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除定时任务失败"})
		return
	}
	// 关联清理日志记录
	tx.Where("task_id = ?", id).Delete(&models.CronTaskLog{})
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
		// 激活时重新计算触发时间戳
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

	c.JSON(http.StatusOK, gin.H{"message": "任务状态已变更", "status": newStatus, "next_run_time": nextTime})
}

// RunTask 立即手动触发执行一次
func (a *CronApi) RunTask(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "任务 ID 格式错误"})
		return
	}

	err = service.TriggerSingleTaskImmediately(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
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

// ListRules 获取自定义抽取配置规则列表
func (a *CronApi) ListRules(c *gin.Context) {
	var rules []models.ExtractorRule
	if err := global.DB.Order("id desc").Find(&rules).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取网页抽取规则列表失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rules})
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

	// 正则有效性检验
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

	if err := global.DB.Unscoped().Delete(&rule).Error; err != nil {
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "抓取或抽取测试发生错误: " + err.Error()})
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
		// 未配置时返回空对象，方便前端渲染表单占位符
		c.JSON(http.StatusOK, gin.H{"data": gin.H{
			"smtp_host":     "",
			"smtp_port":     465,
			"smtp_username": "",
			"smtp_password": "",
		}})
		return
	}

	var notifierSettings service.NotifierSettings
	if err := json.Unmarshal([]byte(setting.Value), &notifierSettings); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "全局配置项序列化解析异常"})
		return
	}

	// 安全脱敏：隐藏发件密码明文
	if notifierSettings.SMTPPassword != "" {
		notifierSettings.SMTPPassword = "*************"
	}

	c.JSON(http.StatusOK, gin.H{"data": notifierSettings})
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

	realPassword := body.SMTPPassword
	if err == nil {
		// 对比脱敏字段，保留真实数据库原值
		var oldSettings service.NotifierSettings
		_ = json.Unmarshal([]byte(setting.Value), &oldSettings)
		if body.SMTPPassword == "*************" {
			realPassword = oldSettings.SMTPPassword
		}
	}

	newSettings := service.NotifierSettings{
		SMTPHost:     body.SMTPHost,
		SMTPPort:     body.SMTPPort,
		SMTPUsername: body.SMTPUsername,
		SMTPPassword: realPassword,
		SiteURL:      strings.TrimSpace(body.SiteURL),
	}

	valBytes, _ := json.Marshal(newSettings)

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
