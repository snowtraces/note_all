package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"note_all_backend/global"
	"note_all_backend/models"

	"github.com/gin-gonic/gin"
)

type ImageGenerationApi struct{}

// GenerateRequest API Payload
type GenerateRequest struct {
	Prompt     string `json:"prompt" binding:"required"`
	Model      string `json:"model" binding:"required"`
	Quantity   int    `json:"quantity"`
	Ratio      string `json:"ratio"`
	Resolution string `json:"resolution"`
}

func localizeImage(remoteUrl string) (string, error) {
	resp, err := http.Get(remoteUrl)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to download image: %d", resp.StatusCode)
	}

	mimeType := resp.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "image/png" // 默认
	}

	// 生成 ID 并存入存储层
	secureName := fmt.Sprintf("gen_%d_%s", time.Now().UnixNano(), strings.ReplaceAll(mimeType, "/", "_"))
	storageID, err := global.Storage.Save(secureName, resp.Body)
	if err != nil {
		return "", err
	}

	// 记录元数据，以便 GetFile 正常读取
	fileMeta := models.FileMetadata{
		StorageID: storageID,
		MimeType:  mimeType,
		FileName:  secureName,
	}
	// 获取文件大小
	if sizeStr := resp.Header.Get("Content-Length"); sizeStr != "" {
		if s, err := strconv.ParseInt(sizeStr, 10, 64); err == nil {
			fileMeta.FileSize = s
		}
	}
	global.DB.Create(&fileMeta)

	return fmt.Sprintf("/api/file/%s", storageID), nil
}

func doSingleGenerate(prompt string, model string, ratio string, resolution string) (string, error) {
	reqBody := map[string]interface{}{
		"prompt":          prompt,
		"model":           model,
		"n":               1, // API 强制要求为 1
		"response_format": "url",
	}

	if ratio != "" {
		reqBody["size"] = ratio
	}
	if resolution != "" {
		reqBody["resolution"] = resolution
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	// 1. 提交任务
	fmt.Printf("[ImageGen] Sending to API Submission: %s\n", string(bodyBytes))
	httpReq, err := http.NewRequest("POST", global.Config.ImageApiUrl, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+global.Config.ImageApiToken)
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	fmt.Printf("[ImageGen] API Raw Response (Submit): %s\n", string(respBody))

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("submit http %d: %s", resp.StatusCode, string(respBody))
	}

	var submitResp struct {
		Data []struct {
			TaskID string `json:"task_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &submitResp); err != nil {
		return "", err
	}
	if len(submitResp.Data) == 0 || submitResp.Data[0].TaskID == "" {
		return "", fmt.Errorf("no task_id")
	}

	taskID := submitResp.Data[0].TaskID

	// 基础 URL 推导
	taskUrl := global.Config.ImageApiUrl
	if lastIdx := strings.LastIndex(taskUrl, "/images/generations"); lastIdx != -1 {
		taskUrl = taskUrl[:lastIdx] + "/tasks/" + taskID
	} else if lastIdx := strings.LastIndex(taskUrl, "/v1/images/generations"); lastIdx != -1 {
		taskUrl = taskUrl[:lastIdx] + "/v1/tasks/" + taskID
	} else {
		taskUrl = taskUrl + "/../../tasks/" + taskID
	}

	// 2. 轮询
	for i := 0; i < 25; i++ {
		time.Sleep(5 * time.Second)
		pollReq, _ := http.NewRequest("GET", taskUrl, nil)
		pollReq.Header.Set("Authorization", "Bearer "+global.Config.ImageApiToken)

		pr, err := client.Do(pollReq)
		if err != nil { continue }
		pb, _ := io.ReadAll(pr.Body)
		pr.Body.Close()

		var resultData struct {
			Data struct {
				Status string `json:"status"`
				Result struct {
					Images []struct {
						Url []string `json:"url"`
					} `json:"images"`
				} `json:"result"`
			} `json:"data"`
		}
		json.Unmarshal(pb, &resultData)

		if resultData.Data.Status == "completed" {
			remoteUrl := resultData.Data.Result.Images[0].Url[0]
			return localizeImage(remoteUrl)
		} else if resultData.Data.Status == "failed" {
			return "", fmt.Errorf("remote task failed")
		}
		fmt.Printf("[ImageGen] Polling %s: %s\n", taskID, resultData.Data.Status)
	}

	return "", fmt.Errorf("timeout")
}

// Generate 生成图片 (1对N, 异步全流程)
func (api *ImageGenerationApi) Generate(c *gin.Context) {
	var req GenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误，请提供 prompt 和 model"})
		return
	}

	// 打印前端请求 Log
	fmt.Printf("[ImageGen] Async Request: model=%s, qty=%d, ratio=%s, res=%s\n", 
		req.Model, req.Quantity, req.Ratio, req.Resolution)

	if global.Config.ImageApiUrl == "" || global.Config.ImageApiToken == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "系统未配置图片生成 API"})
		return
	}

	qty := req.Quantity
	if qty <= 0 { qty = 1 }
	if qty > 4 { qty = 4 }

	// 1. 立即创建任务记录
	record := models.ImageTask{
		Prompt:     req.Prompt,
		Model:      req.Model,
		Quantity:   qty,
		Ratio:      req.Ratio,
		Resolution: req.Resolution,
	}

	if err := global.DB.Create(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建任务失败: " + err.Error()})
		return
	}

	// 2. 异步处理
	go func(task models.ImageTask) {
		var wg sync.WaitGroup
		for i := 0; i < qty; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				url, err := doSingleGenerate(task.Prompt, task.Model, task.Ratio, task.Resolution)
				if err == nil && url != "" {
					result := models.ImageResult{
						TaskID:   task.ID,
						ImageUrl: url,
					}
					global.DB.Create(&result)
					// 每完成一张，通知前端刷新
					fmt.Printf("[ImageGen] SSE Publish: image_gen_refresh for task %d\n", task.ID)
					global.SSEBus.Publish("image_gen_refresh")
				} else {
					fmt.Printf("[ImageGen] Item Failed for Task %d: %v\n", task.ID, err)
				}
			}()
		}
		wg.Wait()
		fmt.Printf("[ImageGen] Async Task %d finished.\n", task.ID)
		// 全部完成后再次通知
		global.SSEBus.Publish("image_gen_refresh")
	}(record)

	// 3. 立即返回
	c.JSON(http.StatusOK, record)
}

// List 历史查询
func (api *ImageGenerationApi) List(c *gin.Context) {
	query := c.Query("query")
	showArchived := c.Query("archived") == "true"

	var records []models.ImageTask
	db := global.DB.Model(&models.ImageTask{}).Preload("Results")

	if query != "" {
		db = db.Where("prompt LIKE ?", "%"+query+"%")
	}

	// 默认只看活跃任务，除非显式查看归档
	db = db.Where("is_archived = ?", showArchived)

	if err := db.Order("created_at DESC").Limit(24).Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取历史失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, records)
}

// ToggleArchive 切换归档状态
func (api *ImageGenerationApi) ToggleArchive(c *gin.Context) {
	id := c.Param("id")
	var task models.ImageTask
	if err := global.DB.First(&task, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
		return
	}

	task.IsArchived = !task.IsArchived
	global.DB.Save(&task)

	c.JSON(http.StatusOK, task)
}
