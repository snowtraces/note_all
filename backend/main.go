package main

import (
	"encoding/json"
	"log"
	"os"

	"note_all_backend/database"
	"note_all_backend/global"
	"note_all_backend/router"
	"note_all_backend/service"
)

func main() {
	// 0. 加载配置
	configBytes, err := os.ReadFile("config.json")
	if err != nil {
		log.Printf("读取 config.json 失败，尝试以默认配置运行: %v\n", err)
	} else if err := json.Unmarshal(configBytes, &global.Config); err != nil {
		log.Fatalf("解析 config.json 失败: %v", err)
	}

	// 1. 初始化底层核心与外置服务（SQLite / FTS5 / SnowStorage）
	database.InitSystem()
	service.InitWorker()
	service.InitActiveWeixinBots()
	log.Println("Note-All 后端底层架构组件初始化成功...")

	// // 1.5 启动向量索引补全
	// go func() {
	// 	// 等待 python embedding 服务启动 (如果是刚拉起来可能需要点时间)
	// 	time.Sleep(10 * time.Second)
	// 	if err := service.BackfillNoteEmbeddings(); err != nil {
	// 		log.Printf("[RAG] 历史向量补全失败: %v", err)
	// 	} else {
	// 		log.Println("[RAG] 历史向量补全任务处理完毕。")
	// 	}
	// }()

	// 2. 装载网络层路由 (Gin)
	r := router.SetupRouter()

	// 3. 开始在 3344 端口驻留监听服务请求
	log.Println("Http 接口层已注册，服务驻留于端口: 3344")
	if err := r.Run(":3344"); err != nil {
		log.Fatalf("接口服务崩溃: %v", err)
	}
}
