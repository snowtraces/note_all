package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/robfig/cron/v3"
	"note_all_backend/global"
	"note_all_backend/models"
)

type contextKey string

const taskNameKey contextKey = "task_name"

// StartCronScheduler 启动常驻定时任务调度轮询引擎 (由 main.go 启动)
func StartCronScheduler(ctx context.Context) {
	log.Println("[Scheduler] 核心定时任务调度引擎正在启动...")

	// 启动时补齐没有下一次运行时间值的活跃任务时间戳
	initActiveTasksNextRunTime()

	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[Scheduler] 定时任务引擎已安全退出。")
			return
		case <-ticker.C:
			runPendingTasks(ctx)
		}
	}
}

// 补齐活跃任务的 NextRunTime
func initActiveTasksNextRunTime() {
	var tasks []models.CronTask
	err := global.DB.Where("status = ? AND next_run_time IS NULL", "active").Find(&tasks).Error
	if err != nil {
		log.Printf("[Scheduler] 启动盘点任务失败: %v", err)
		return
	}

	now := time.Now()
	for _, task := range tasks {
		nextTime := CalculateNextRunTime(task.ScheduleType, task.ScheduleValue, now)
		global.DB.Model(&task).Update("next_run_time", nextTime)
		log.Printf("[Scheduler] 为活跃任务 [%s] 初始化下一次运行时间: %s", task.Name, nextTime.Format("2006-01-02 15:04:05"))
	}
}

// 检索并执行已到期的任务
func runPendingTasks(ctx context.Context) {
	var tasks []models.CronTask
	now := time.Now()

	// 检查当前应该运行的任务 (处于 active 状态，且到期了)
	err := global.DB.Where("status = ? AND (next_run_time <= ? OR next_run_time IS NULL)", "active", now).Find(&tasks).Error
	if err != nil {
		log.Printf("[Scheduler] 扫描待到期任务数据库异常: %v", err)
		return
	}

	for _, task := range tasks {
		// 立即计算并持久化下一次运行时间，防止 goroutine 执行期间被下一个 ticker tick 重复拾取
		nextTime := CalculateNextRunTime(task.ScheduleType, task.ScheduleValue, now)
		global.DB.Model(&task).Updates(map[string]interface{}{
			"next_run_time": nextTime,
		})

		// 每一个任务都在专属协程中异步跑，并进行 Crash 捕获防御，互不干扰
		go executeSingleTaskWithRecovery(ctx, task)
	}
}

// 带有崩溃保护的执行单元
func executeSingleTaskWithRecovery(ctx context.Context, task models.CronTask) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[Scheduler] 任务异常崩溃 (ID: %d, Name: %s): %v", task.ID, task.Name, r)
		}
	}()

	log.Printf("[Scheduler] 触发定时任务 -> ID: %d, Name: [%s]", task.ID, task.Name)
	startTime := time.Now()

	// 1. 初始化写入运行中 (running) 状态日志记录
	runLog := models.CronTaskLog{
		TaskID:    task.ID,
		StartTime: startTime,
		Status:    "running",
	}
	if err := global.DB.Create(&runLog).Error; err != nil {
		log.Printf("[Scheduler] 创建任务运行日志失败 (Task: %s): %v", task.Name, err)
		return
	}

	// 2. 执行任务：优先管道模式，降级旧版 TaskHandler
	var summary string
	var runErr error
	var stepResultsJSON string

	steps, parseErr := ParseSteps(task.Steps)
	if parseErr == nil && len(steps) > 0 {
		// 管道模式
		taskCtx := context.WithValue(ctx, taskNameKey, task.Name)
		results, pipeErr := ExecutePipeline(taskCtx, task.Name, steps)
		runErr = pipeErr

		// 序列化步骤结果
		if len(results) > 0 {
			// 清除 output 全文（只保留 preview），避免日志表膨胀
			sanitized := make([]StepResult, len(results))
			copy(sanitized, results)
			for i := range sanitized {
				sanitized[i].Output = ""
			}
			if b, err := json.Marshal(sanitized); err == nil {
				stepResultsJSON = string(b)
			}

			lastResult := results[len(results)-1]
			if lastResult.Status == "success" {
				summary = fmt.Sprintf("管道执行成功 (%d 步)。最终输出: %s", len(results), lastResult.OutputPreview)
			} else {
				summary = fmt.Sprintf("管道在步骤 %d 失败", lastResult.Step)
			}
		}
	} else {
		// 旧版兼容：使用 TaskHandler
		handler, exists := GetTaskHandler(task.TaskType)
		if !exists {
			runErr = fmt.Errorf("系统中未找到注册的任务处理器: %s", task.TaskType)
		} else {
			taskCtx := context.WithValue(ctx, taskNameKey, task.Name)
			summary, runErr = handler.Execute(taskCtx, task.Config)
		}
	}

	endTime := time.Now()
	runLog.EndTime = endTime
	runLog.StepResults = stepResultsJSON

	// 3. 处理执行状态并回填写回日志
	if runErr != nil {
		log.Printf("[Scheduler] 任务运行失败: %s | 错误: %v", task.Name, runErr)
		runLog.Status = "failure"
		runLog.ErrorMessage = runErr.Error()
		if summary == "" {
			summary = "定时执行失败。"
		}
		runLog.ResultSummary = summary
	} else {
		log.Printf("[Scheduler] 任务运行成功: %s | 概要: %s", task.Name, summary)
		runLog.Status = "success"
		runLog.ResultSummary = summary
	}

	global.DB.Save(&runLog)

	// 4. 回填最后运行时间 (next_run_time 已在 goroutine 启动前设置)
	global.DB.Model(&task).Update("last_run_time", &startTime)

	// 5. 触发推送，自动在后台发出
	go SendTaskNotification(task.Name, &runLog, task.Notification)
}

// TriggerSingleTaskImmediately 手动立即触发执行任务一次 (异步，用于测试/手动触发)
func TriggerSingleTaskImmediately(taskID uint) error {
	var task models.CronTask
	if err := global.DB.First(&task, taskID).Error; err != nil {
		return err
	}

	go func() {
		ctx := context.Background()
		startTime := time.Now()

		log.Printf("[Scheduler] 手动触发即时执行 -> ID: %d, Name: [%s]", task.ID, task.Name)

		runLog := models.CronTaskLog{
			TaskID:    task.ID,
			StartTime: startTime,
			Status:    "running",
		}
		global.DB.Create(&runLog)

		var summary string
		var runErr error
		var stepResultsJSON string

		steps, parseErr := ParseSteps(task.Steps)
		if parseErr == nil && len(steps) > 0 {
			taskCtx := context.WithValue(ctx, taskNameKey, task.Name)
			results, pipeErr := ExecutePipeline(taskCtx, task.Name, steps)
			runErr = pipeErr

			if len(results) > 0 {
				sanitized := make([]StepResult, len(results))
				copy(sanitized, results)
				for i := range sanitized {
					sanitized[i].Output = ""
				}
				if b, err := json.Marshal(sanitized); err == nil {
					stepResultsJSON = string(b)
				}

				lastResult := results[len(results)-1]
				if lastResult.Status == "success" {
					summary = fmt.Sprintf("管道执行成功 (%d 步)。最终输出: %s", len(results), lastResult.OutputPreview)
				} else {
					summary = fmt.Sprintf("管道在步骤 %d 失败", lastResult.Step)
				}
			}
		} else {
			handler, exists := GetTaskHandler(task.TaskType)
			if !exists {
				runErr = fmt.Errorf("未找到任务处理器: %s", task.TaskType)
			} else {
				taskCtx := context.WithValue(ctx, taskNameKey, task.Name)
				summary, runErr = handler.Execute(taskCtx, task.Config)
			}
		}

		endTime := time.Now()
		runLog.EndTime = endTime
		runLog.StepResults = stepResultsJSON

		if runErr != nil {
			runLog.Status = "failure"
			runLog.ErrorMessage = runErr.Error()
			if summary == "" {
				summary = "手动执行失败。"
			}
			runLog.ResultSummary = summary
		} else {
			runLog.Status = "success"
			runLog.ResultSummary = summary
		}
		global.DB.Save(&runLog)

		// 手动运行不变更下一次预计周期运行时间，仅覆盖最后运行时间
		global.DB.Model(&task).Update("last_run_time", &startTime)

		go SendTaskNotification(task.Name, &runLog, task.Notification)
	}()

	return nil
}

// CalculateNextRunTime 计算特定任务的下一次计划时间
func CalculateNextRunTime(scheduleType, val string, lastTime time.Time) *time.Time {
	now := time.Now()
	if lastTime.IsZero() {
		lastTime = now
	}

	if scheduleType == "cron" {
		parser := cron.NewParser(cron.SecondOptional | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor)
		sched, err := parser.Parse(val)
		if err == nil {
			next := sched.Next(lastTime)
			return &next
		}
		log.Printf("[Scheduler] Cron 表达式 [%s] 解析失败: %v", val, err)
	}

	if scheduleType == "interval" {
		var mins int
		_, err := fmt.Sscanf(val, "%d", &mins)
		if err != nil || mins <= 0 {
			mins = 60 // 默认每小时执行一次
		}
		next := lastTime.Add(time.Duration(mins) * time.Minute)
		if next.Before(now) {
			next = now.Add(time.Duration(mins) * time.Minute)
		}
		return &next
	}

	if scheduleType == "daily" {
		// 期待格式为 "HH:MM"，如 "09:30"
		parts := strings.Split(strings.TrimSpace(val), ":")
		if len(parts) == 2 {
			var hour, min int
			_, err1 := fmt.Sscanf(parts[0], "%d", &hour)
			_, err2 := fmt.Sscanf(parts[1], "%d", &min)
			if err1 == nil && err2 == nil && hour >= 0 && hour < 24 && min >= 0 && min < 60 {
				next := time.Date(now.Year(), now.Month(), now.Day(), hour, min, 0, 0, now.Location())
				if next.Before(now) || next.Equal(now) {
					next = next.Add(24 * time.Hour)
				}
				return &next
			}
		}
	}

	// 降级兜底：默认 24 小时后
	log.Printf("[Scheduler] 未识别的调度类型 [%s]，默认 24 小时后执行", scheduleType)
	next := now.Add(24 * time.Hour)
	return &next
}