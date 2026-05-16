package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"
)

// ==================== 数据结构 ====================

// StepDefinition 管道步骤定义
type StepDefinition struct {
	Step   int                    `json:"step"`
	Name   string                 `json:"name"`
	Action string                 `json:"action"` // web_crawl, ai_process
	Input  StepInput              `json:"input"`
	Config map[string]interface{} `json:"config"`
}

// StepInput 步骤输入配置
type StepInput struct {
	Source  string                 `json:"source"`   // "fixed" 或 "step"
	StepRef int                   `json:"step_ref"`  // 引用步骤号 (source=step 时)
	Config  map[string]interface{} `json:"config"`   // 固定输入配置 (source=fixed 时)
}

// StepResult 步骤执行结果
type StepResult struct {
	Step          int    `json:"step"`
	Action        string `json:"action"`
	Status        string `json:"status"` // success, failure
	Output        string `json:"output"`
	OutputPreview string `json:"output_preview"`
	DurationMs    int64  `json:"duration_ms"`
	Error         string `json:"error,omitempty"`
}

// ==================== Action Handler 注册 ====================

// ActionHandler 节点动作处理器接口
type ActionHandler interface {
	Execute(ctx context.Context, input string, config map[string]interface{}) (output string, err error)
}

var actionHandlers = make(map[string]ActionHandler)

// RegisterActionHandler 注册动作处理器
func RegisterActionHandler(actionType string, handler ActionHandler) {
	actionHandlers[actionType] = handler
}

// GetActionHandler 获取动作处理器
func GetActionHandler(actionType string) (ActionHandler, bool) {
	h, ok := actionHandlers[actionType]
	return h, ok
}

// ==================== 管道执行引擎 ====================

// ExecutePipeline 执行管道，返回所有步骤结果
func ExecutePipeline(ctx context.Context, taskName string, steps []StepDefinition) ([]StepResult, error) {
	if len(steps) == 0 {
		return nil, fmt.Errorf("管道步骤为空")
	}

	results := make([]StepResult, 0, len(steps))
	outputs := make(map[int]string) // step 编号 → 输出

	for _, step := range steps {
		select {
		case <-ctx.Done():
			return results, ctx.Err()
		default:
		}

		log.Printf("[Pipeline] 开始执行步骤 %d [%s]: %s", step.Step, step.Action, step.Name)
		startTime := time.Now()

		// 1. 获取输入
		input, err := resolveInput(step, outputs)
		if err != nil {
			result := StepResult{
				Step:       step.Step,
				Action:     step.Action,
				Status:     "failure",
				DurationMs: time.Since(startTime).Milliseconds(),
				Error:      fmt.Sprintf("输入解析失败: %v", err),
			}
			results = append(results, result)
			return results, fmt.Errorf("步骤 %d 输入解析失败: %v", step.Step, err)
		}

		// 2. 获取并执行 ActionHandler
		handler, exists := GetActionHandler(step.Action)
		if !exists {
			result := StepResult{
				Step:       step.Step,
				Action:     step.Action,
				Status:     "failure",
				DurationMs: time.Since(startTime).Milliseconds(),
				Error:      fmt.Sprintf("未注册的动作类型: %s", step.Action),
			}
			results = append(results, result)
			return results, fmt.Errorf("步骤 %d 未注册的动作类型: %s", step.Step, step.Action)
		}

		// 3. 使用超时 context 执行
		stepCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
		output, execErr := handler.Execute(stepCtx, input, step.Config)
		cancel()

		durationMs := time.Since(startTime).Milliseconds()

		if execErr != nil {
			log.Printf("[Pipeline] 步骤 %d [%s] 执行失败 (%dms): %v", step.Step, step.Action, durationMs, execErr)
			result := StepResult{
				Step:       step.Step,
				Action:     step.Action,
				Status:     "failure",
				DurationMs: durationMs,
				Error:      execErr.Error(),
			}
			results = append(results, result)
			return results, fmt.Errorf("步骤 %d 执行失败: %v", step.Step, execErr)
		}

		// 4. 记录成功结果
		log.Printf("[Pipeline] 步骤 %d [%s] 执行成功 (%dms), 输出长度: %d", step.Step, step.Action, durationMs, len(output))
		outputs[step.Step] = output

		preview := output
		if len(preview) > 200 {
			preview = preview[:200] + "..."
		}

		results = append(results, StepResult{
			Step:          step.Step,
			Action:        step.Action,
			Status:        "success",
			Output:        output,
			OutputPreview: preview,
			DurationMs:    durationMs,
		})
	}

	// 5. 最终步骤输出保存为笔记
	if len(results) > 0 {
		lastResult := results[len(results)-1]
		if lastResult.Status == "success" && lastResult.Output != "" {
			go savePipelineResultAsNote(taskName, lastResult.Output)
		}
	}

	return results, nil
}

// resolveInput 解析步骤输入
func resolveInput(step StepDefinition, outputs map[int]string) (string, error) {
	switch step.Input.Source {
	case "fixed":
		// 固定输入：从 input.config 中提取
		if step.Input.Config == nil {
			return "", nil
		}
		// 将 config 序列化为 JSON 字符串传入 handler
		configBytes, err := json.Marshal(step.Input.Config)
		if err != nil {
			return "", fmt.Errorf("固定输入序列化失败: %v", err)
		}
		return string(configBytes), nil

	case "step":
		// 引用前序步骤输出
		ref := step.Input.StepRef
		if ref <= 0 {
			// 默认引用上一步
			ref = step.Step - 1
		}
		if ref >= step.Step {
			return "", fmt.Errorf("步骤 %d 不能引用步骤 %d 的输出（防循环）", step.Step, ref)
		}
		output, ok := outputs[ref]
		if !ok {
			return "", fmt.Errorf("步骤 %d 的输出不存在", ref)
		}
		return output, nil

	default:
		return "", fmt.Errorf("未知输入来源: %s", step.Input.Source)
	}
}

// savePipelineResultAsNote 将管道最终输出保存为笔记
func savePipelineResultAsNote(taskName string, content string) {
	nowStr := time.Now().Format("2006-01-02 15:04")
	title := fmt.Sprintf("%s_%s", taskName, nowStr)

	secureName := fmt.Sprintf("pipeline_%d_result.md", time.Now().UnixNano())
	storageID, err := global.Storage.Save(secureName, strings.NewReader(content))
	if err != nil {
		log.Printf("[Pipeline] 保存管道结果笔记失败 (存储): %v", err)
		return
	}

	note := models.NoteItem{
		OriginalName: title,
		StorageID:    storageID,
		FileType:     "text/markdown",
		FileSize:     int64(len(content)),
		OcrText:      content,
		FolderL1:     "任务",
		FolderL2:     taskName,
		Status:       "done",
	}

	if err := global.DB.Create(&note).Error; err != nil {
		log.Printf("[Pipeline] 保存管道结果笔记失败 (DB): %v", err)
		return
	}

	log.Printf("[Pipeline] 管道结果已保存为笔记 (ID:%d, 分类: 任务/%s, 标题: %s)", note.ID, taskName, title)

	// 仅触发向量生成（目录已确定，不需要 AI 归类分析）
	nID := note.ID
	global.WorkerChan <- func() {
		log.Printf("[Pipeline] 开始为管道结果笔记 (ID:%d) 生成向量...", nID)
		UpdateNoteChunks(nID)
		global.SSEBus.Publish("refresh")
	}
}

// ValidateSteps 校验管道步骤定义
func ValidateSteps(steps []StepDefinition) error {
	if len(steps) == 0 {
		return fmt.Errorf("管道步骤不能为空")
	}
	if len(steps) > 4 {
		return fmt.Errorf("管道步骤最多 4 个，当前 %d 个", len(steps))
	}

	for i, step := range steps {
		expectedStep := i + 1
		if step.Step != expectedStep {
			return fmt.Errorf("步骤编号必须从 1 连续递增，期望 %d 但收到 %d", expectedStep, step.Step)
		}

		if step.Action == "" {
			return fmt.Errorf("步骤 %d 的动作类型 (action) 不能为空", step.Step)
		}

		if _, ok := GetActionHandler(step.Action); !ok {
			return fmt.Errorf("步骤 %d 的动作类型 [%s] 未注册", step.Step, step.Action)
		}

		// 首节点只能使用固定输入
		if step.Step == 1 {
			if step.Input.Source != "fixed" {
				return fmt.Errorf("首节点 (步骤 1) 只能使用固定输入 (source=fixed)")
			}
		} else {
			if step.Input.Source == "step" {
				ref := step.Input.StepRef
				if ref <= 0 {
					ref = step.Step - 1 // 默认上一步
				}
				if ref >= step.Step {
					return fmt.Errorf("步骤 %d 不能引用步骤 %d 的输出（防循环）", step.Step, ref)
				}
			}
		}
	}

	return nil
}

// ParseSteps 从 JSON 字符串解析步骤定义
func ParseSteps(stepsJSON string) ([]StepDefinition, error) {
	if stepsJSON == "" {
		return nil, nil
	}
	var steps []StepDefinition
	if err := json.Unmarshal([]byte(stepsJSON), &steps); err != nil {
		return nil, fmt.Errorf("管道步骤 JSON 解析失败: %v", err)
	}
	return steps, nil
}
