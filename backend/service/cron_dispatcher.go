package service

import (
	"context"
	"sync"
)

// TaskHandler 定义了可执行定时任务的标准接口
type TaskHandler interface {
	Execute(ctx context.Context, configStr string) (result string, err error)
}

var (
	handlers   = make(map[string]TaskHandler)
	handlersMu sync.RWMutex
)

// RegisterTaskHandler 注册任务处理器
func RegisterTaskHandler(taskType string, handler TaskHandler) {
	handlersMu.Lock()
	defer handlersMu.Unlock()
	handlers[taskType] = handler
}

// GetTaskHandler 获取已注册的处理器
func GetTaskHandler(taskType string) (TaskHandler, bool) {
	handlersMu.RLock()
	defer handlersMu.RUnlock()
	h, ok := handlers[taskType]
	return h, ok
}
