package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"os"

	"note_all_backend/database"
	"note_all_backend/global"
	"note_all_backend/mcp"
	"note_all_backend/router"
	"note_all_backend/service"

	"gorm.io/gorm/logger"
)

func main() {
	// 解析命令行参数
	mcpMode := flag.Bool("mcp", false, "以 MCP 协议(SSE/HTTP)模式启动服务")
	flag.Parse()

	if *mcpMode {
		// 0. 加载配置
		configBytes, err := os.ReadFile("config.json")
		if err != nil {
			log.Printf("读取 config.json 失败，尝试以默认配置运行: %v\n", err)
		} else if err := json.Unmarshal(configBytes, &global.Config); err != nil {
			log.Fatalf("解析 config.json 失败: %v", err)
		}

		// 1. 仅初始化底层核心组件，不启动 Gin Web、微信机器人、自动同步等
		database.InitSystem()
		service.InitWorker()

		// 彻底关闭 GORM SQL 日志打印到 stdout，保持控制台整洁
		if global.DB != nil {
			global.DB.Logger = global.DB.Logger.LogMode(logger.Silent)
		}

		log.Println("Note-All 正在以 MCP 服务端模式启动（SSE 传输协议）...")

		// 启动 MCP 服务端协议，开始监听 stdin/stdout 传输流
		mcp.StartServer()
		return
	}

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

	// 1.1 启动定时任务后台调度轮询器
	go service.StartCronScheduler(context.Background())

	log.Println("Note-All 后端底层架构组件初始化成功...")

	// 1.5 向量重建已移至设置页面 (POST /api/system/embedding/rebuild)

	// 2. 装载网络层路由 (Gin)
	r := router.SetupRouter()

	// 3. 开始在 3344 端口驻留监听服务请求
	log.Println("Http 接口层已注册，服务驻留于端口: 3344")
	if err := r.Run(":3344"); err != nil {
		log.Fatalf("接口服务崩溃: %v", err)
	}
}
