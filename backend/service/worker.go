package service

import (
	"log"
	"note_all_backend/global"
)

// InitWorker 初始化后台任务消费协程，确保任务按序串行执行，避免触发外部 API 429 限流
func InitWorker() {
	// 初始化带缓冲的任务队列
	global.WorkerChan = make(chan func(), 100)

	// 启动唯一的消费协程
	go func() {
		log.Println("[Worker] 后台串行任务消费队列已启动")
		for task := range global.WorkerChan {
			processTask(task)
		}
	}()
}

// processTask 执行具体任务，这里可以增加一些公共的错误捕获或延迟处理逻辑
func processTask(task func()) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[Worker] 任务执行过程中发生 Panic: %v", r)
		}
	}()

	// 执行实际的闭包任务
	task()
}
